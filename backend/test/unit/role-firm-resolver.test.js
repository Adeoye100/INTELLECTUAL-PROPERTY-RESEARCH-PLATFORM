import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RedisRoleFirmResolver, ROLE_CACHE_TTL_SECONDS } from '../../src/auth/role-firm-resolver.js';

const supabaseUserId = '11111111-1111-4111-8111-111111111111';
const firmId = '22222222-2222-4222-8222-222222222222';

function fakeRedis() {
  const values = new Map();
  const sets = [];
  return { values, sets, async get(key) { return values.get(key) ?? null; }, async set(key, value, options) { values.set(key, value); sets.push({ key, value, options }); }, async del(key) { values.delete(key); } };
}

describe('RedisRoleFirmResolver', () => {
  it('never links a local account by email during ordinary session resolution', async () => {
    const redisClient = fakeRedis();
    let lookups = 0;
    const resolver = new RedisRoleFirmResolver({
      redisClient,
      userRepository: { async findBySupabaseUserId() { lookups += 1; return null; } },
    });
    assert.equal(await resolver.resolveRoleAndFirm(supabaseUserId, 'admin@example.test'), null);
    assert.equal(await resolver.resolveRoleAndFirm(supabaseUserId, 'changed@example.test'), null);
    assert.equal(lookups, 1);
    assert.deepEqual(redisClient.sets[0], { key: 'role-cache:' + supabaseUserId, value: JSON.stringify({ missing: true }), options: { EX: ROLE_CACHE_TTL_SECONDS } });
  });

  it('resolves only the persisted Supabase identity and invalidates its cache', async () => {
    const redisClient = fakeRedis();
    let lookups = 0;
    const resolver = new RedisRoleFirmResolver({ redisClient, userRepository: { async findBySupabaseUserId() { lookups += 1; return { role: 'attorney', firmId }; } } });
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId), { role: 'attorney', firmId });
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId), { role: 'attorney', firmId });
    assert.equal(lookups, 1);
    await resolver.invalidate(supabaseUserId);
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId), { role: 'attorney', firmId });
    assert.equal(lookups, 2);
  });

  it('fails closed without querying dependencies for an invalid Supabase subject', async () => {
    const resolver = new RedisRoleFirmResolver({ redisClient: fakeRedis(), userRepository: { async findBySupabaseUserId() { assert.fail('invalid identity must not query PostgreSQL'); } } });
    assert.equal(await resolver.resolveRoleAndFirm('not-a-uuid'), null);
  });
});
