const APPLICATION_ROLES = new Set(['admin', 'attorney', 'viewer']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|user_[a-zA-Z0-9_]+)$/i;

export const ROLE_CACHE_TTL_SECONDS = 60;

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
      || (typeof userRepository.findBySupabaseUserId !== 'function' && typeof userRepository.findByAuthId !== 'function')
    ) {
      throw new TypeError('RedisRoleFirmResolver needs a user repository.');
    }
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new TypeError('Role-cache TTL must be a positive integer.');
    }

    this.redisClient = redisClient;
    this.userRepository = userRepository;
    this.adminUserService = supabaseAdminUserService || null;
    this.ttlSeconds = ttlSeconds;
  }

  keyFor(supabaseUserId) {
    return `role-cache:${supabaseUserId}`;
  }

  async resolveRoleAndFirm(supabaseUserId, email) {
    if (typeof supabaseUserId !== 'string' || !USER_ID_PATTERN.test(supabaseUserId)) return null;

    const key = this.keyFor(supabaseUserId);
    const serialized = await this.redisClient.get(key);
    if (serialized) {
      try {
        const cached = JSON.parse(serialized);
        if (cached?.missing === true) return null;
        if (validMembership(cached)) {
          return {
            role: cached.role,
            firmId: cached.firmId,
            ...(cached.email ? { email: cached.email } : {}),
          };
        }
      } catch {
        // Invalid internal cache data is discarded and reloaded from PostgreSQL.
      }
      await this.redisClient.del(key);
    }

    let membership = typeof this.userRepository.findByAuthId === 'function'
      ? await this.userRepository.findByAuthId(supabaseUserId, email)
      : await this.userRepository.findBySupabaseUserId(supabaseUserId);

    if (!membership && this.adminUserService && typeof this.adminUserService.getAuthoritativeUser === 'function') {
      try {
        const authoritative = await this.adminUserService.getAuthoritativeUser(supabaseUserId);
        if (authoritative?.email) {
          membership = typeof this.userRepository.findByAuthId === 'function'
            ? await this.userRepository.findByAuthId(supabaseUserId, authoritative.email)
            : (typeof this.userRepository.findOrLinkBySupabaseIdentity === 'function'
              ? await this.userRepository.findOrLinkBySupabaseIdentity(supabaseUserId, authoritative.email)
              : null);
        }
      } catch {
        // Fall back to missing
      }
    }

    const cacheValue = validMembership(membership)
      ? {
          role: membership.role,
          firmId: membership.firmId,
          ...(membership.email ? { email: membership.email } : {}),
        }
      : { missing: true };
    await this.redisClient.set(key, JSON.stringify(cacheValue), { EX: this.ttlSeconds });
    return cacheValue.missing ? null : cacheValue;
  }

  async invalidate(supabaseUserId) {
    if (typeof supabaseUserId !== 'string' || !USER_ID_PATTERN.test(supabaseUserId)) return;
    await this.redisClient.del(this.keyFor(supabaseUserId));
  }
}
