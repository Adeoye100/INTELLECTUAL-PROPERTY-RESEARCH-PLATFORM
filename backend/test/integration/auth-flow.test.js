import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { runMigrations } from '../../src/db/migration-runner.js';
import { createSystem } from '../../src/system.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const redisUrl = process.env.TEST_REDIS_URL?.trim();
if (!databaseUrl || !redisUrl) {
  throw new Error(
    'Real integration stores are required. Set TEST_DATABASE_URL and TEST_REDIS_URL; '
    + 'the documented compose setup provides both.',
  );
}

const suffix = randomUUID();
const firmName = `Integration Firm ${suffix}`;
const adminEmail = `admin-${suffix}@example.test`;
const viewerEmail = `viewer-${suffix}@example.test`;
const password = 'integration-password';
const issuedRefreshTokens = [];
let system;
let firmId;

const config = {
  databaseUrl,
  redisUrl,
  jwtAccessSecret: 'integration-only-secret-that-is-at-least-32-bytes',
  jwtIssuer: 'iprp-integration-test',
  jwtAudience: 'iprp-integration-client',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 3_600,
};

before(async () => {
  system = await createSystem(config);
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(system.pool, path.resolve(currentDirectory, '../../migrations'));
  assert.equal((await system.redisClient.ping()), 'PONG');
  assert.equal((await system.pool.query('SELECT 1 AS connected')).rows[0].connected, 1);
});

after(async () => {
  if (!system) return;
  await Promise.all(issuedRefreshTokens.map((token) => system.sessionStore.invalidate(token)));
  if (firmId) {
    await system.pool.query('DELETE FROM users WHERE firm_id = $1', [firmId]);
    await system.pool.query('DELETE FROM firms WHERE id = $1', [firmId]);
  }
  await system.close();
});

describe('auth API with real PostgreSQL and Redis', () => {
  it('creates the documented firms/users schema and role enum', async () => {
    const columns = await system.pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('firms', 'users')
      ORDER BY table_name, ordinal_position
    `);
    assert.deepEqual(
      columns.rows.filter(({ table_name }) => table_name === 'firms').map(({ column_name }) => column_name),
      ['id', 'name', 'subscription_tier', 'created_at'],
    );
    assert.deepEqual(
      columns.rows.filter(({ table_name }) => table_name === 'users').map(({ column_name }) => column_name),
      ['id', 'firm_id', 'email', 'password_hash', 'role', 'created_at', 'last_login_at'],
    );

    const roles = await system.pool.query(`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'user_role'
      ORDER BY enumsortorder
    `);
    assert.deepEqual(roles.rows.map(({ enumlabel }) => enumlabel), ['admin', 'attorney', 'viewer']);
  });

  it('runs signup, login, refresh rotation, and logout end to end', async () => {
    const signup = await request(system.app).post('/api/v1/auth/signup').send({
      firmName,
      email: adminEmail,
      password,
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.user.role, 'admin');
    assert.ok(signup.body.accessToken);
    assert.ok(signup.body.refreshToken);
    firmId = signup.body.user.firmId;
    issuedRefreshTokens.push(signup.body.refreshToken);

    const signupSessionKey = system.sessionStore.keyFor(signup.body.refreshToken);
    assert.equal(signupSessionKey.includes(signup.body.refreshToken), false);
    assert.ok(await system.redisClient.get(signupSessionKey));

    const stored = await system.pool.query(
      'SELECT password_hash, last_login_at FROM users WHERE email = $1',
      [adminEmail],
    );
    assert.notEqual(stored.rows[0].password_hash, password);
    assert.match(stored.rows[0].password_hash, /^\$argon2id\$/);
    assert.equal(stored.rows[0].last_login_at, null);

    const adminPing = await request(system.app)
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${signup.body.accessToken}`);
    assert.equal(adminPing.status, 200);

    const login = await request(system.app).post('/api/v1/auth/login').send({
      email: adminEmail.toUpperCase(),
      password,
    });
    assert.equal(login.status, 200);
    issuedRefreshTokens.push(login.body.refreshToken);
    assert.ok((await system.pool.query(
      'SELECT last_login_at FROM users WHERE email = $1',
      [adminEmail],
    )).rows[0].last_login_at);

    const refresh = await request(system.app).post('/api/v1/auth/refresh').send({
      refreshToken: login.body.refreshToken,
    });
    assert.equal(refresh.status, 200);
    assert.notEqual(refresh.body.refreshToken, login.body.refreshToken);
    issuedRefreshTokens.push(refresh.body.refreshToken);
    assert.equal(await system.redisClient.get(system.sessionStore.keyFor(login.body.refreshToken)), null);
    assert.ok(await system.redisClient.get(system.sessionStore.keyFor(refresh.body.refreshToken)));

    const replay = await request(system.app).post('/api/v1/auth/refresh').send({
      refreshToken: login.body.refreshToken,
    });
    assert.equal(replay.status, 401);

    const logout = await request(system.app).post('/api/v1/auth/logout').send({
      refreshToken: refresh.body.refreshToken,
    });
    assert.equal(logout.status, 204);
    assert.equal(await system.redisClient.get(system.sessionStore.keyFor(refresh.body.refreshToken)), null);

    const afterLogout = await request(system.app).post('/api/v1/auth/refresh').send({
      refreshToken: refresh.body.refreshToken,
    });
    assert.equal(afterLogout.status, 401);
  });

  it('matches normalized firm names, defaults additional users to Viewer, and enforces RBAC', async () => {
    const signup = await request(system.app).post('/api/v1/auth/signup').send({
      firmName: `  ${firmName.toUpperCase()}  `,
      email: viewerEmail,
      password,
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.user.firmId, firmId);
    assert.equal(signup.body.user.role, 'viewer');
    issuedRefreshTokens.push(signup.body.refreshToken);

    const viewerPing = await request(system.app)
      .get('/api/v1/viewer/ping')
      .set('Authorization', `Bearer ${signup.body.accessToken}`);
    assert.equal(viewerPing.status, 200);

    const forbidden = await request(system.app)
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${signup.body.accessToken}`);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, 'FORBIDDEN');

    await system.pool.query("UPDATE users SET role = 'attorney' WHERE email = $1", [viewerEmail]);
    const attorneyLogin = await request(system.app).post('/api/v1/auth/login').send({
      email: viewerEmail,
      password,
    });
    issuedRefreshTokens.push(attorneyLogin.body.refreshToken);
    const attorneyPing = await request(system.app)
      .get('/api/v1/attorney/ping')
      .set('Authorization', `Bearer ${attorneyLogin.body.accessToken}`);
    assert.equal(attorneyPing.status, 200);
  });

  it('never echoes a rejected password', async () => {
    const rejectedPassword = 'wrong-private-password';
    const response = await request(system.app).post('/api/v1/auth/login').send({
      email: adminEmail,
      password: rejectedPassword,
    });
    assert.equal(response.status, 401);
    assert.equal(JSON.stringify(response.body).includes(rejectedPassword), false);
  });
});
