import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError } from '../errors.js';

export const AUTH_RATE_LIMIT_POLICY_VERSION = 'auth-rate-limit-policy-v1';

const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`;

const RATE_LIMITED_MESSAGE = 'Too many authentication attempts. Try again later.';
const UNAVAILABLE_MESSAGE = 'Authentication protection is temporarily unavailable.';

function unavailableRateLimitError() {
  return new AppError(503, 'AUTH_RATE_LIMIT_UNAVAILABLE', UNAVAILABLE_MESSAGE);
}

function normalizeReply(reply, windowSeconds) {
  const [countValue, ttlValue] = Array.isArray(reply) ? reply : [];
  const count = Number(countValue);
  const rawTtl = Number(ttlValue);
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(rawTtl)) {
    throw new Error('Invalid Redis rate-limit response.');
  }
  return { count, ttlSeconds: Math.max(1, Math.min(windowSeconds, Math.ceil(rawTtl))) };
}

export function normalizeClientAddress(address) {
  const value = String(address ?? '').trim();
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) return value.slice(7);
  return isIP(value) ? value : 'unknown';
}

export function resolveTrustedClientAddress(request, _response, next) {
  request.authRateLimitIp = normalizeClientAddress(request.ip ?? request.socket?.remoteAddress);
  next();
}

export class RedisAuthRateLimiter {
  constructor({ redisClient, secret, policies, clock = () => new Date() }) {
    if (!redisClient || typeof redisClient.eval !== 'function') {
      throw new Error('RedisAuthRateLimiter requires a Redis client with eval.');
    }
    if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('AUTH_RATE_LIMIT_KEY_SECRET must contain at least 32 bytes.');
    }
    this.redisClient = redisClient;
    this.secret = secret;
    this.policies = { ...policies };
    this.clock = clock;
  }

  identifier(value) {
    return createHmac('sha256', this.secret).update(String(value)).digest('hex');
  }

  keyFor(policyName, identifier) {
    if (!this.policies[policyName]) throw new Error(`Unknown auth rate-limit policy: ${policyName}`);
    return `auth-limit:v1:${policyName}:${this.identifier(identifier)}`;
  }

  async consume(policyName, identifier) {
    const policy = this.policies[policyName];
    if (!policy) throw new Error(`Unknown auth rate-limit policy: ${policyName}`);
    const key = this.keyFor(policyName, identifier);
    let reply;
    try {
      reply = await this.redisClient.eval(RATE_LIMIT_LUA, {
        keys: [key],
        arguments: [String(policy.windowSeconds)],
      });
    } catch {
      throw unavailableRateLimitError();
    }

    let result;
    try {
      result = normalizeReply(reply, policy.windowSeconds);
    } catch {
      throw unavailableRateLimitError();
    }
    const remaining = Math.max(0, policy.limit - result.count);
    return {
      allowed: result.count <= policy.limit,
      limit: policy.limit,
      remaining,
      retryAfterSeconds: result.ttlSeconds,
      resetSeconds: result.ttlSeconds,
      resetAt: new Date(this.clock().getTime() + (result.ttlSeconds * 1000)),
    };
  }

  async recordIdentityFailure(policyName, identity) {
    return this.consume(policyName, identity);
  }

  async clearIdentityFailures(policyName, identity) {
    const key = this.keyFor(policyName, identity);
    try {
      await this.redisClient.del(key);
    } catch {
      throw unavailableRateLimitError();
    }
  }
}

function setRateLimitHeaders(response, result) {
  response.set({
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(result.resetSeconds),
  });
}

export function createAuthIpRateLimit({ limiter, policyName, failClosed = true, logger = console }) {
  if (!limiter) return (_request, _response, next) => next();

  return async (request, response, next) => {
    try {
      const result = await limiter.consume(policyName, request.authRateLimitIp ?? normalizeClientAddress(request.ip));
      setRateLimitHeaders(response, result);
      if (result.allowed) return next();
      response.set('Retry-After', String(result.retryAfterSeconds));
      return response.status(429).json({
        error: { code: 'AUTH_RATE_LIMITED', message: RATE_LIMITED_MESSAGE },
      });
    } catch {
      if (failClosed) return next(unavailableRateLimitError());
      logger.warn('Authentication rate limiter unavailable', { code: 'AUTH_RATE_LIMIT_UNAVAILABLE' });
      return next();
    }
  };
}

export const authRateLimitMessages = {
  rateLimited: RATE_LIMITED_MESSAGE,
  unavailable: UNAVAILABLE_MESSAGE,
};
