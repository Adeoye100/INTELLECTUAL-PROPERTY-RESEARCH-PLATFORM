import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import {
  AUTH_RATE_LIMIT_POLICY_VERSION,
  RedisAuthRateLimiter,
  createAuthIpRateLimit,
  normalizeClientAddress,
  resolveTrustedClientAddress,
} from '../../src/auth/auth-rate-limiter.js';
import { errorHandler } from '../../src/errors.js';
import { createAuthRouter } from '../../src/routes/auth-routes.js';
import { createProvisioningRouter } from '../../src/routes/provisioning-routes.js';

const secret = 'test-only-rate-limit-secret-with-32-bytes';
const policies = {
  loginIp: { limit: 2, windowSeconds: 30 },
  loginIdentity: { limit: 2, windowSeconds: 30 },
  recoveryIp: { limit: 2, windowSeconds: 60 },
  recoveryIdentity: { limit: 2, windowSeconds: 60 },
  refreshSession: { limit: 3, windowSeconds: 20 },
  logoutIp: { limit: 60, windowSeconds: 60 },
};

class FakeRedis {
  constructor(clock) {
    this.clock = clock;
    this.entries = new Map();
    this.keys = [];
    this.fail = false;
  }

  async eval(_script, { keys, arguments: args }) {
    if (this.fail) throw new Error('redis unavailable');
    const [key] = keys;
    this.keys.push(key);
    const windowSeconds = Number(args[0]);
    const current = this.entries.get(key);
    const now = this.clock().getTime();
    const entry = !current || current.expiresAt <= now
      ? { count: 1, expiresAt: now + (windowSeconds * 1000) }
      : { ...current, count: current.count + 1 };
    this.entries.set(key, entry);
    return [entry.count, Math.ceil((entry.expiresAt - now) / 1000)];
  }

  async del(key) {
    if (this.fail) throw new Error('redis unavailable');
    this.entries.delete(key);
  }
}

function createLimiter(overrides = {}) {
  let now = new Date('2026-08-21T12:00:00.000Z');
  const clock = () => now;
  const redis = new FakeRedis(clock);
  return {
    redis,
    limiter: new RedisAuthRateLimiter({ redisClient: redis, secret, policies, clock, ...overrides }),
    advance(seconds) { now = new Date(now.getTime() + (seconds * 1000)); },
  };
}

function rateLimitApp(limiter, options = {}) {
  const app = express();
  app.set('trust proxy', options.trustProxyHops ?? 0);
  app.use(resolveTrustedClientAddress);
  app.use(createAuthIpRateLimit({ limiter, policyName: 'loginIp', ...options }));
  app.get('/auth', (_request, response) => response.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('Redis-backed authentication rate limiter', () => {
  it('uses the versioned policies and constant-format HMAC Redis keys', async () => {
    const { limiter, redis } = createLimiter();
    const result = await limiter.consume('loginIp', '2001:db8::1');

    assert.equal(AUTH_RATE_LIMIT_POLICY_VERSION, 'auth-rate-limit-policy-v1');
    assert.equal(result.allowed, true);
    assert.match(redis.keys[0], /^auth-limit:v1:loginIp:[a-f0-9]{64}$/);
    assert.equal(redis.keys[0].includes('2001:db8::1'), false);
    assert.equal(redis.keys[0].includes('person@example.test'), false);
    const refresh = await limiter.consume('refreshSession', 'opaque-server-session-id');
    assert.equal(refresh.allowed, true);
    assert.equal(redis.keys[1].includes('opaque-server-session-id'), false);
  });

  it('enforces the exact boundary atomically and reports TTL-based reset metadata', async () => {
    const { limiter, advance } = createLimiter();
    assert.equal((await limiter.consume('loginIp', '198.51.100.7')).remaining, 1);
    advance(4);
    const boundary = await limiter.consume('loginIp', '198.51.100.7');
    assert.deepEqual({ allowed: boundary.allowed, remaining: boundary.remaining, retry: boundary.retryAfterSeconds }, {
      allowed: true, remaining: 0, retry: 26,
    });
    assert.equal((await limiter.consume('loginIp', '198.51.100.7')).allowed, false);

    const concurrent = await Promise.all(Array.from({ length: 12 }, () => limiter.consume('recoveryIp', '203.0.113.8')));
    assert.equal(concurrent.filter((result) => result.allowed).length, 2);
  });

  it('keeps IP and identity failure counters independent and clears only successful identities', async () => {
    const { limiter, redis } = createLimiter();
    await limiter.consume('loginIp', '203.0.113.1');
    await limiter.recordIdentityFailure('loginIdentity', 'person@example.test');
    await limiter.recordIdentityFailure('loginIdentity', 'person@example.test');
    assert.equal((await limiter.recordIdentityFailure('loginIdentity', 'person@example.test')).allowed, false);
    await limiter.clearIdentityFailures('loginIdentity', 'person@example.test');
    assert.equal((await limiter.recordIdentityFailure('loginIdentity', 'person@example.test')).allowed, true);
    assert.equal((await limiter.consume('loginIp', '203.0.113.1')).allowed, true);
  });

  it('returns the documented 429 body and accurate rate-limit headers', async () => {
    const { limiter } = createLimiter();
    const app = rateLimitApp(limiter);
    const first = await request(app).get('/auth');
    const second = await request(app).get('/auth');
    const rejected = await request(app).get('/auth');
    assert.equal(first.status, 200);
    assert.equal(second.headers['ratelimit-remaining'], '0');
    assert.equal(rejected.status, 429);
    assert.deepEqual(rejected.body, {
      error: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' },
    });
    assert.equal(rejected.headers['retry-after'], '30');
    assert.equal(rejected.headers['ratelimit-limit'], '2');
    assert.equal(rejected.headers['ratelimit-remaining'], '0');
    assert.equal(rejected.headers['ratelimit-reset'], '30');
  });

  it('fails closed for sensitive routes but leaves logout-style protection available on Redis failure', async () => {
    const { limiter, redis } = createLimiter();
    redis.fail = true;
    const closed = await request(rateLimitApp(limiter)).get('/auth');
    assert.equal(closed.status, 503);
    assert.equal(closed.body.code, 'AUTH_RATE_LIMIT_UNAVAILABLE');

    const warnings = [];
    const open = await request(rateLimitApp(limiter, {
      failClosed: false,
      logger: { warn(message, fields) { warnings.push([message, fields]); } },
    })).get('/auth');
    assert.equal(open.status, 200);
    assert.deepEqual(warnings, [['Authentication rate limiter unavailable', { code: 'AUTH_RATE_LIMIT_UNAVAILABLE' }]]);
  });

  it('handles IPv4 and IPv6 without trusting spoofed forwarding when disabled', async () => {
    assert.equal(normalizeClientAddress('::ffff:192.0.2.10'), '192.0.2.10');
    assert.equal(normalizeClientAddress('2001:db8::10'), '2001:db8::10');
    const { limiter, redis } = createLimiter();
    const direct = await request(rateLimitApp(limiter, { trustProxyHops: 0 }))
      .get('/auth').set('X-Forwarded-For', '198.51.100.77');
    assert.equal(direct.status, 200);
    assert.equal(redis.keys.includes(limiter.keyFor('loginIp', '198.51.100.77')), false);

    const proxied = await request(rateLimitApp(limiter, { trustProxyHops: 1 }))
      .get('/auth').set('X-Forwarded-For', '2001:db8::77');
    assert.equal(proxied.status, 200);
  });

  it('runs the backend-owned invitation limiter before its service and before the fallback', async () => {
    const { limiter } = createLimiter();
    const calls = [];
    const app = express();
    app.use('/api/v1/auth', createAuthRouter({
      async invitationDetails(token) { calls.push(token); return { token }; },
      async acceptInvitation() { return {}; },
    }, (_request, _response, next) => next(), { authRateLimiter: limiter }));
    app.use((_request, response) => response.status(404).json({ code: 'NOT_FOUND' }));
    app.use(errorHandler);

    assert.equal((await request(app).get('/api/v1/auth/invitations/one')).status, 200);
    assert.equal((await request(app).get('/api/v1/auth/invitations/two')).status, 200);
    const rejected = await request(app).get('/api/v1/auth/invitations/three');
    assert.equal(rejected.status, 429);
    assert.deepEqual(calls, ['one', 'two']);
  });

  it('validates sensitive auth bodies after IP limiting and before authentication/service execution', async () => {
    const { limiter } = createLimiter();
    let authenticated = false;
    const app = express();
    app.use(express.json());
    app.use('/api/v1/provisioning', createProvisioningRouter(
      (_request, _response, next) => { authenticated = true; next(); },
      { async provisionFirm() { return {}; } },
      { authRateLimiter: limiter },
    ));
    app.use(errorHandler);

    const invalid = await request(app).post('/api/v1/provisioning/firm').send({ firm_id: 'forbidden' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'VALIDATION_ERROR');
    assert.equal(authenticated, false);
  });

  it('does not mutate caller policy objects or supplied identifiers', async () => {
    const inputPolicies = structuredClone(policies);
    const identity = { toString() { return 'opaque-server-session-id'; } };
    const before = structuredClone(inputPolicies);
    const { limiter, redis } = createLimiter({ policies: inputPolicies });
    await limiter.consume('refreshSession', identity);
    assert.deepEqual(inputPolicies, before);
    assert.equal(Object.keys(identity).length, 1);
    assert.equal(redis.keys.length, 1);
  });
});
