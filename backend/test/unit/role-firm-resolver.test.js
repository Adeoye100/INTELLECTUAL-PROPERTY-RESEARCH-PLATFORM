import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RedisRoleFirmResolver, ROLE_CACHE_TTL_SECONDS } from '../../src/auth/role-firm-resolver.js';

const supabaseUserId = '11111111-1111-4111-8111-111111111111';
const firmId = '22222222-2222-4222-8222-222222222222';

function fakeRedis() {
  const values = new Map();
  const sets = [];
  return {
    values,
    sets,
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options) {
      values.set(key, value);
      sets.push({ key, value, options });
    },
    async del(key) { values.delete(key); },
  };
}

describe('RedisRoleFirmResolver', () => {
  it('links a confirmed identity on a cache miss and serves the second request from Redis', async () => {
    const redisClient = fakeRedis();
    const stableIdLookups = [];
    const linkAttempts = [];
    let adminLookups = 0;
    const resolver = new RedisRoleFirmResolver({
      redisClient,
      userRepository: {
        async findBySupabaseUserId(id) {
          stableIdLookups.push(id);
          return null;
        },
        async findOrLinkBySupabaseIdentity(id, email) {
          linkAttempts.push({ id, email });
          return { role: 'admin', firmId };
        },
      },
      supabaseAdminUserService: {
        async getAuthoritativeUser(id) {
          adminLookups += 1;
          assert.equal(id, supabaseUserId);
          return { email: 'Admin@Example.Test', emailConfirmed: true };
        },
      },
    });

    assert.deepEqual(
      await resolver.resolveRoleAndFirm(supabaseUserId, ' ADMIN@EXAMPLE.TEST '),
      { role: 'admin', firmId },
    );
    assert.deepEqual(
      await resolver.resolveRoleAndFirm(supabaseUserId, 'changed@example.test'),
      { role: 'admin', firmId },
    );
    assert.deepEqual(stableIdLookups, [supabaseUserId]);
    assert.deepEqual(linkAttempts, [{ id: supabaseUserId, email: 'admin@example.test' }]);
    assert.equal(adminLookups, 1);
    assert.deepEqual(redisClient.sets[0].options, { EX: ROLE_CACHE_TTL_SECONDS });
    assert.equal(redisClient.sets[0].key, `role-cache:${supabaseUserId}`);
  });

  it('rejects an unconfirmed authoritative email without attempting a link', async () => {
    const redisClient = fakeRedis();
    let adminLookups = 0;
    const resolver = new RedisRoleFirmResolver({
      redisClient,
      userRepository: {
        async findBySupabaseUserId() { return null; },
        async findOrLinkBySupabaseIdentity() {
          assert.fail('an unconfirmed identity must not reach the atomic linking query');
        },
      },
      supabaseAdminUserService: {
        async getAuthoritativeUser() {
          adminLookups += 1;
          return { email: 'unconfirmed@example.test', emailConfirmed: false };
        },
      },
    });

    assert.equal(
      await resolver.resolveRoleAndFirm(supabaseUserId, 'unconfirmed@example.test'),
      null,
    );
    assert.equal(
      await resolver.resolveRoleAndFirm(supabaseUserId, 'unconfirmed@example.test'),
      null,
    );
    assert.equal(adminLookups, 1, 'the missing result should be served from Redis');
  });

  it('does not call the Admin API for an already-linked identity, including after cache expiry', async () => {
    const redisClient = fakeRedis();
    let stableIdLookups = 0;
    const resolver = new RedisRoleFirmResolver({
      redisClient,
      userRepository: {
        async findBySupabaseUserId() {
          stableIdLookups += 1;
          return { role: 'attorney', firmId };
        },
        async findOrLinkBySupabaseIdentity() {
          assert.fail('an already-linked identity must not reach the linking query');
        },
      },
      supabaseAdminUserService: {
        async getAuthoritativeUser() {
          assert.fail('an already-linked identity must not call the Supabase Admin API');
        },
      },
    });

    const expected = { role: 'attorney', firmId };
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId, 'user@example.test'), expected);
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId, 'user@example.test'), expected);
    assert.equal(stableIdLookups, 1);

    await resolver.invalidate(supabaseUserId);
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId, 'user@example.test'), expected);
    assert.equal(stableIdLookups, 2);
  });

  it('rejects a confirmed Admin record whose email differs from the verified token', async () => {
    const resolver = new RedisRoleFirmResolver({
      redisClient: fakeRedis(),
      userRepository: {
        async findBySupabaseUserId() { return null; },
        async findOrLinkBySupabaseIdentity() {
          assert.fail('mismatched identity emails must not reach the linking query');
        },
      },
      supabaseAdminUserService: {
        async getAuthoritativeUser() {
          return { email: 'different@example.test', emailConfirmed: true };
        },
      },
    });

    assert.equal(await resolver.resolveRoleAndFirm(supabaseUserId, 'user@example.test'), null);
  });

  it('fails closed without querying dependencies for an invalid Supabase subject', async () => {
    const resolver = new RedisRoleFirmResolver({
      redisClient: fakeRedis(),
      userRepository: {
        async findBySupabaseUserId() {
          assert.fail('invalid identities must not reach PostgreSQL');
        },
        async findOrLinkBySupabaseIdentity() {
          assert.fail('invalid identities must not reach PostgreSQL');
        },
      },
      supabaseAdminUserService: {
        async getAuthoritativeUser() {
          assert.fail('invalid identities must not reach the Supabase Admin API');
        },
      },
    });

    assert.equal(await resolver.resolveRoleAndFirm('not-a-uuid', 'user@example.test'), null);
  });
});
