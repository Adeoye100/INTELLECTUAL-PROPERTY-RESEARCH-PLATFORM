import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createClient } from 'redis';
import { RedisRoleFirmResolver } from '../../src/auth/role-firm-resolver.js';
import { UserRepository } from '../../src/auth/user-repository.js';
import { createPool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migration-runner.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const redisUrl = process.env.TEST_REDIS_URL?.trim();
if (!databaseUrl || !redisUrl) {
  throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL are required for role-cache integration tests.');
}

const pool = createPool(databaseUrl, process.env.DATABASE_SSL === 'true');
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', () => {});
const supabaseUserId = randomUUID();
const unconfirmedSupabaseUserId = randomUUID();
const firmId = randomUUID();
const email = `supabase-link-${randomUUID()}@example.test`;
const unconfirmedEmail = `supabase-unconfirmed-${randomUUID()}@example.test`;
let resolver;
let repository;
let databaseLookups = 0;
let adminLookups = 0;

before(async () => {
  await redisClient.connect();
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(pool, path.resolve(currentDirectory, '../../migrations'));
  await pool.query(
    `INSERT INTO firms (id, name) VALUES ($1, $2)`,
    [firmId, `Role Cache Firm ${firmId}`],
  );
  await pool.query(
    `INSERT INTO users (firm_id, email, password_hash, role)
     VALUES
       ($1, $2, 'not-used-by-this-test', 'attorney'),
       ($1, $3, 'not-used-by-this-test', 'viewer')`,
    [firmId, email, unconfirmedEmail],
  );
  repository = new UserRepository(pool);
  resolver = new RedisRoleFirmResolver({
    redisClient,
    ttlSeconds: 1,
    userRepository: {
      async findBySupabaseUserId(...args) {
        databaseLookups += 1;
        return repository.findBySupabaseUserId(...args);
      },
      async findOrLinkBySupabaseIdentity(...args) {
        databaseLookups += 1;
        return repository.findOrLinkBySupabaseIdentity(...args);
      },
    },
    supabaseAdminUserService: {
      async getAuthoritativeUser(id) {
        adminLookups += 1;
        assert.equal(id, supabaseUserId);
        return { email, emailConfirmed: true };
      },
    },
  });
});

after(async () => {
  if (resolver) await resolver.invalidate(supabaseUserId);
  await pool.query('DELETE FROM users WHERE firm_id = $1', [firmId]);
  await pool.query('DELETE FROM firms WHERE id = $1', [firmId]);
  await Promise.allSettled([redisClient.quit(), pool.end()]);
});

describe('role/firm resolution with real PostgreSQL and Redis', () => {
  it('links a confirmed email, hits Redis, and re-queries locally after expiry', async () => {
    const expected = { role: 'attorney', firmId };
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId, email.toUpperCase()), expected);
    assert.equal(databaseLookups, 2);
    assert.equal(adminLookups, 1);
    assert.equal((await pool.query(
      'SELECT supabase_user_id FROM users WHERE email = $1',
      [email],
    )).rows[0].supabase_user_id, supabaseUserId);

    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId, email), expected);
    assert.equal(databaseLookups, 2, 'second request must use Redis');
    assert.equal(adminLookups, 1, 'second request must not call the Supabase Admin API');

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.deepEqual(await resolver.resolveRoleAndFirm(supabaseUserId, email), expected);
    assert.equal(databaseLookups, 3, 'expired cache entry must re-query PostgreSQL');
    assert.equal(adminLookups, 1, 'an already-linked identity must not call the Admin API');
  });

  it('does not link an authoritative unconfirmed-email fixture', async () => {
    const unconfirmedResolver = new RedisRoleFirmResolver({
      redisClient,
      userRepository: repository,
      supabaseAdminUserService: {
        async getAuthoritativeUser(id) {
          assert.equal(id, unconfirmedSupabaseUserId);
          return { email: unconfirmedEmail, emailConfirmed: false };
        },
      },
    });

    try {
      assert.equal(
        await unconfirmedResolver.resolveRoleAndFirm(
          unconfirmedSupabaseUserId,
          unconfirmedEmail,
        ),
        null,
      );
      const result = await pool.query(
        'SELECT supabase_user_id FROM users WHERE email = $1',
        [unconfirmedEmail],
      );
      assert.equal(result.rows[0].supabase_user_id, null);
    } finally {
      await unconfirmedResolver.invalidate(unconfirmedSupabaseUserId);
    }
  });
});
