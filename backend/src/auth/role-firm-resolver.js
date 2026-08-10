const APPLICATION_ROLES = new Set(['admin', 'attorney', 'viewer']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROLE_CACHE_TTL_SECONDS = 60;

function normalizedEmail(email) {
  if (typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  return value && !value.includes(' ') ? value : null;
}

function validMembership(value) {
  return value
    && typeof value === 'object'
    && APPLICATION_ROLES.has(value.role)
    && typeof value.firmId === 'string'
    && UUID_PATTERN.test(value.firmId);
}

export class RedisRoleFirmResolver {
  constructor({
    redisClient,
    userRepository,
    supabaseAdminUserService,
    ttlSeconds = ROLE_CACHE_TTL_SECONDS,
  }) {
    if (
      !redisClient
      || typeof redisClient.get !== 'function'
      || typeof redisClient.set !== 'function'
      || typeof redisClient.del !== 'function'
    ) {
      throw new TypeError('RedisRoleFirmResolver needs a Redis client.');
    }
    if (
      !userRepository
      || typeof userRepository.findBySupabaseUserId !== 'function'
      || typeof userRepository.findOrLinkBySupabaseIdentity !== 'function'
    ) {
      throw new TypeError('RedisRoleFirmResolver needs a user repository.');
    }
    if (
      !supabaseAdminUserService
      || typeof supabaseAdminUserService.getAuthoritativeUser !== 'function'
    ) {
      throw new TypeError('RedisRoleFirmResolver needs a Supabase Admin user service.');
    }
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new TypeError('Role-cache TTL must be a positive integer.');
    }

    this.redisClient = redisClient;
    this.userRepository = userRepository;
    this.supabaseAdminUserService = supabaseAdminUserService;
    this.ttlSeconds = ttlSeconds;
  }

  keyFor(supabaseUserId) {
    return `role-cache:${supabaseUserId}`;
  }

  async resolveRoleAndFirm(supabaseUserId, email) {
    if (typeof supabaseUserId !== 'string' || !UUID_PATTERN.test(supabaseUserId)) return null;

    const key = this.keyFor(supabaseUserId);
    const serialized = await this.redisClient.get(key);
    if (serialized) {
      try {
        const cached = JSON.parse(serialized);
        if (cached?.missing === true) return null;
        if (validMembership(cached)) return { role: cached.role, firmId: cached.firmId };
      } catch {
        // Invalid internal cache data is discarded and reloaded from PostgreSQL.
      }
      await this.redisClient.del(key);
    }

    let membership = await this.userRepository.findBySupabaseUserId(supabaseUserId);
    if (!membership) {
      const verifiedTokenEmail = normalizedEmail(email);
      if (verifiedTokenEmail) {
        const authoritativeUser = await this.supabaseAdminUserService.getAuthoritativeUser(
          supabaseUserId,
        );
        const authoritativeEmail = normalizedEmail(authoritativeUser.email);
        if (authoritativeUser.emailConfirmed === true && authoritativeEmail === verifiedTokenEmail) {
          membership = await this.userRepository.findOrLinkBySupabaseIdentity(
            supabaseUserId,
            authoritativeEmail,
          );
        }
      }
    }
    const cacheValue = validMembership(membership)
      ? { role: membership.role, firmId: membership.firmId }
      : { missing: true };
    await this.redisClient.set(key, JSON.stringify(cacheValue), { EX: this.ttlSeconds });
    return cacheValue.missing ? null : cacheValue;
  }

  async invalidate(supabaseUserId) {
    if (typeof supabaseUserId !== 'string' || !UUID_PATTERN.test(supabaseUserId)) return;
    await this.redisClient.del(this.keyFor(supabaseUserId));
  }
}
