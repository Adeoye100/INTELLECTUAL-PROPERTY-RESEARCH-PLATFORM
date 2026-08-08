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
const invitedEmail = `viewer-${suffix}@example.test`;
const blockedEmail = `blocked-${suffix}@example.test`;
const expiredEmail = `expired-${suffix}@example.test`;
const signupInviteEmail = `signup-invite-${suffix}@example.test`;
const password = 'integration-password';
const issuedRefreshTokens = [];
let system;
let firmId;
let adminAccessToken;
let acceptedInviteToken;

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
    await system.pool.query('DELETE FROM firm_invitations WHERE firm_id = $1', [firmId]);
    await system.pool.query('DELETE FROM users WHERE firm_id = $1', [firmId]);
    await system.pool.query('DELETE FROM firms WHERE id = $1', [firmId]);
  }
  await system.close();
});

describe('auth API with real PostgreSQL and Redis', () => {
  it('creates the documented firms/users/invitations schema and role enum', async () => {
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

    const invitationColumns = await system.pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'firm_invitations'
      ORDER BY ordinal_position
    `);
    assert.deepEqual(invitationColumns.rows.map(({ column_name }) => column_name), [
      'id', 'firm_id', 'issued_by_user_id', 'email', 'intended_name', 'role',
      'expires_at', 'used_at', 'created_at',
    ]);

    const roles = await system.pool.query(`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'user_role'
      ORDER BY enumsortorder
    `);
    assert.deepEqual(roles.rows.map(({ enumlabel }) => enumlabel), ['admin', 'attorney', 'viewer']);
  });

  it('keeps new-firm self-serve signup, login, refresh rotation, and logout working', async () => {
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
    adminAccessToken = signup.body.accessToken;
    issuedRefreshTokens.push(signup.body.refreshToken);

    const signupSessionKey = system.sessionStore.keyFor(signup.body.refreshToken);
    assert.equal(signupSessionKey.includes(signup.body.refreshToken), false);
    const signupSessionValue = await system.redisClient.get(signupSessionKey);
    assert.ok(signupSessionValue);
    assert.equal(signupSessionValue.includes(signup.body.refreshToken), false);
    assert.deepEqual(
      Object.keys(JSON.parse(signupSessionValue)).sort(),
      ['createdAt', 'userId'],
    );

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
    const rotatedSessionValue = await system.redisClient.get(
      system.sessionStore.keyFor(refresh.body.refreshToken),
    );
    assert.ok(rotatedSessionValue);
    assert.equal(rotatedSessionValue.includes(refresh.body.refreshToken), false);

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

  it('blocks self-serve signup when the normalized firm name already exists', async () => {
    const signup = await request(system.app).post('/api/v1/auth/signup').send({
      firmName: `  ${firmName.toUpperCase()}  `,
      email: blockedEmail,
      password,
    });
    assert.equal(signup.status, 409);
    assert.equal(signup.body.code, 'FIRM_ALREADY_EXISTS');
    assert.match(signup.body.message, /request an invitation/i);
    assert.equal((await system.pool.query('SELECT 1 FROM users WHERE email = $1', [blockedEmail])).rowCount, 0);
  });

  it('lets an Admin issue a signed invite and joins with its intended firm and role', async () => {
    const issued = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ fullName: 'Invited Viewer', email: invitedEmail, role: 'viewer' });
    assert.equal(issued.status, 201);
    assert.equal(issued.body.email, invitedEmail);
    assert.equal(issued.body.firmName, firmName);
    assert.equal(issued.body.role, 'viewer');
    assert.equal(typeof issued.body.token, 'string');

    acceptedInviteToken = issued.body.token;
    const details = await request(system.app)
      .get(`/api/v1/auth/invitations/${acceptedInviteToken}`);
    assert.equal(details.status, 200);
    assert.deepEqual(details.body, { email: invitedEmail, firmName, role: 'viewer' });

    const accepted = await request(system.app)
      .post(`/api/v1/auth/invitations/${acceptedInviteToken}/accept`)
      .send({ fullName: 'Invited Viewer', password });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.user.firmId, firmId);
    assert.equal(accepted.body.user.role, 'viewer');
    assert.equal(accepted.body.user.email, invitedEmail);
    assert.equal(accepted.body.token, accepted.body.accessToken);
    assert.equal(typeof accepted.body.expiresAt, 'number');
    issuedRefreshTokens.push(accepted.body.refreshToken);

    const viewerPing = await request(system.app)
      .get('/api/v1/viewer/ping')
      .set('Authorization', `Bearer ${accepted.body.accessToken}`);
    assert.equal(viewerPing.status, 200);

    const forbidden = await request(system.app)
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${accepted.body.accessToken}`);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, 'FORBIDDEN');

    const viewerIssueAttempt = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${accepted.body.accessToken}`)
      .send({ fullName: 'Unauthorized Invite', email: 'unauthorized@example.test', role: 'viewer' });
    assert.equal(viewerIssueAttempt.status, 403);
  });

  it('redeems an invite through signup and ignores any caller-supplied role or firm', async () => {
    const issued = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ fullName: 'Invited Attorney', email: signupInviteEmail, role: 'attorney' });
    assert.equal(issued.status, 201);

    const signup = await request(system.app).post('/api/v1/auth/signup').send({
      inviteToken: issued.body.token,
      fullName: 'Invited Attorney',
      email: signupInviteEmail.toUpperCase(),
      firmName: 'Caller Controlled Firm',
      role: 'admin',
      password,
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.user.firmId, firmId);
    assert.equal(signup.body.user.role, 'attorney');
    assert.equal(signup.body.firm.name, firmName);
    issuedRefreshTokens.push(signup.body.refreshToken);
  });

  it('rejects reuse of an accepted invitation with a clear error', async () => {
    const replay = await request(system.app)
      .post(`/api/v1/auth/invitations/${acceptedInviteToken}/accept`)
      .send({ fullName: 'Invited Viewer', password });
    assert.equal(replay.status, 410);
    assert.equal(replay.body.code, 'EXPIRED_LINK');
    assert.match(replay.body.message, /already been used/i);
  });

  it('rejects an expired invitation with a clear error', async () => {
    const issued = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ fullName: 'Expired Invite', email: expiredEmail, role: 'attorney' });
    assert.equal(issued.status, 201);

    await system.pool.query(
      `UPDATE firm_invitations
       SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
       WHERE email = $1`,
      [expiredEmail],
    );
    const expired = await request(system.app)
      .post(`/api/v1/auth/invitations/${issued.body.token}/accept`)
      .send({ fullName: 'Expired Invite', password });
    assert.equal(expired.status, 410);
    assert.equal(expired.body.code, 'EXPIRED_LINK');
    assert.match(expired.body.message, /expired/i);
    assert.equal((await system.pool.query('SELECT 1 FROM users WHERE email = $1', [expiredEmail])).rowCount, 0);
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
