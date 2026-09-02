import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { runMigrations } from '../../src/db/migration-runner.js';
import { createSystem } from '../../src/system.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const databaseSsl = process.env.DATABASE_SSL === 'true';
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
const adminSupabaseUserId = randomUUID();
const blockedSupabaseUserId = randomUUID();
const invitedSupabaseUserId = randomUUID();
let system;
let firmId;
let adminAccessToken;
let acceptedInviteToken;

const config = {
  databaseUrl,
  databaseSsl,
  redisUrl,
  jwtAccessSecret: 'integration-only-secret-that-is-at-least-32-bytes',
  supabaseUrl: 'https://example.supabase.co',
  supabaseSecretKey: 'integration-only-supabase-secret-key-at-least-32-bytes',
  supabaseJwtVerificationMode: 'jwks',
  supabaseJwtAlgorithms: ['ES256'],
  inviteTokenTtlSeconds: 604_800,
};

before(async () => {
  system = await createSystem(config);
  system.supabaseVerifier.verifyAccessToken = async (token) => {
    if (token === 'admin-signup-token') {
      return {
        userId: adminSupabaseUserId,
        email: adminEmail,
        supabaseRole: 'authenticated',
        sessionId: 'admin-signup-session',
        claims: {},
      };
    }
    if (token === 'blocked-signup-token') {
      return {
        userId: blockedSupabaseUserId,
        email: blockedEmail,
        supabaseRole: 'authenticated',
        sessionId: 'blocked-signup-session',
        claims: {},
      };
    }
    if (token === 'invited-first-use-token') {
      return {
        userId: invitedSupabaseUserId,
        email: invitedEmail,
        supabaseRole: 'authenticated',
        sessionId: 'invited-first-use-session',
        claims: {},
      };
    }
    throw Object.assign(new Error('invalid test token'), { code: 'TEST_TOKEN_INVALID' });
  };
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(system.pool, path.resolve(currentDirectory, '../../migrations'));
  assert.equal((await system.redisClient.ping()), 'PONG');
  assert.equal((await system.pool.query('SELECT 1 AS connected')).rows[0].connected, 1);
});

after(async () => {
  if (!system) return;
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
      [
        'id', 'name', 'subscription_tier', 'created_at', 'subscription_status',
        'subscription_provider', 'subscription_code', 'subscription_customer_code',
        'subscription_renews_at',
      ],
    );
    assert.deepEqual(
      columns.rows.filter(({ table_name }) => table_name === 'users').map(({ column_name }) => column_name),
      [
        'id', 'firm_id', 'email', 'password_hash', 'role', 'created_at', 'last_login_at',
        'supabase_user_id',
      ],
    );
    const passwordHashColumn = await system.pool.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
    `);
    assert.equal(passwordHashColumn.rows[0].is_nullable, 'YES');

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

  it('provisions and immediately links a new firm from a verified Supabase identity', async () => {
    const provisioning = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer admin-signup-token')
      .send({ firmName });
    assert.equal(provisioning.status, 201);
    assert.equal(provisioning.body.user.role, 'admin');
    assert.equal(provisioning.body.user.email, adminEmail);
    assert.ok(!provisioning.body.accessToken);
    firmId = provisioning.body.user.firmId;
    adminAccessToken = provisioning.body.user.id; // Store local Admin ID for invitation test

    const stored = await system.pool.query(
      'SELECT password_hash, last_login_at, supabase_user_id FROM users WHERE email = $1',
      [adminEmail],
    );
    assert.equal(stored.rows[0].password_hash, null);
    assert.equal(stored.rows[0].last_login_at, null);
    assert.equal(stored.rows[0].supabase_user_id, adminSupabaseUserId);

    const repeated = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer admin-signup-token')
      .send({ firmName: 'A different ignored name' });
    assert.equal(repeated.status, 201);
    assert.equal(repeated.body.user.firmId, firmId);
    assert.equal((await system.pool.query(
      'SELECT count(*)::int AS count FROM firms WHERE id = $1',
      [firmId],
    )).rows[0].count, 1);
  });

  it('blocks firm provisioning when the normalized firm name already exists', async () => {
    const provisioning = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer blocked-signup-token')
      .send({ firmName: `  ${firmName.toUpperCase()}  ` });
    assert.equal(provisioning.status, 409);
    assert.equal(provisioning.body.code, 'FIRM_ALREADY_EXISTS');
    assert.match(provisioning.body.message, /request an invitation/i);
    assert.equal((await system.pool.query('SELECT 1 FROM users WHERE email = $1', [blockedEmail])).rowCount, 0);
  });

  it('lets an Admin issue a signed invite and joins with its intended firm and role', async () => {
    // In new world, we need a Supabase user/token to call /admin/invitations.
    // We'll use the real admin user created in the signup test.
    const invitation = await system.authService.issueInvitation(
      { userId: adminAccessToken, firmId, role: 'admin' },
      { fullName: 'Invited Viewer', email: invitedEmail, role: 'viewer' }
    );
    assert.ok(invitation.token);
    assert.equal(invitation.email, invitedEmail);
    assert.equal(invitation.role, 'viewer');

    acceptedInviteToken = invitation.token;
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
    assert.ok(!accepted.body.accessToken);
    assert.equal((await system.pool.query(
      'SELECT password_hash FROM users WHERE email = $1',
      [invitedEmail],
    )).rows[0].password_hash, null);

    const firstUseLink = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer invited-first-use-token')
      .send({ firmName: 'Must not create a second firm' });
    assert.equal(firstUseLink.status, 201);
    assert.equal(firstUseLink.body.user.role, 'viewer');
    assert.equal(firstUseLink.body.user.firmId, firmId);
    assert.equal((await system.pool.query(
      'SELECT supabase_user_id FROM users WHERE email = $1',
      [invitedEmail],
    )).rows[0].supabase_user_id, invitedSupabaseUserId);
  });

  it('ignores caller-supplied role and firm when redeeming an invite', async () => {
    // Again, we'll use the real admin user to bypass RBAC for this test.
    const issued = await system.authService.issueInvitation(
      { userId: adminAccessToken, firmId, role: 'admin' },
      { fullName: 'Invited Attorney', email: signupInviteEmail, role: 'attorney' }
    );

    const accepted = await request(system.app)
      .post(`/api/v1/auth/invitations/${issued.token}/accept`)
      .send({
      fullName: 'Invited Attorney',
      email: signupInviteEmail.toUpperCase(),
      firmName: 'Caller Controlled Firm',
      role: 'admin',
      password,
    });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.user.firmId, firmId);
    assert.equal(accepted.body.user.role, 'attorney');
    assert.equal(accepted.body.firm.name, firmName);
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
    // Use service to issue
    const issued = await system.authService.issueInvitation(
      { userId: adminAccessToken, firmId, role: 'admin' },
      { fullName: 'Expired Invite', email: expiredEmail, role: 'attorney' }
    );

    await system.pool.query(
      `UPDATE firm_invitations
       SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
       WHERE email = $1`,
      [expiredEmail],
    );
    const expired = await request(system.app)
      .post(`/api/v1/auth/invitations/${issued.token}/accept`)
      .send({ fullName: 'Expired Invite', password });
    assert.equal(expired.status, 410);
    assert.equal(expired.body.code, 'EXPIRED_LINK');
    assert.match(expired.body.message, /expired/i);
    assert.equal((await system.pool.query('SELECT 1 FROM users WHERE email = $1', [expiredEmail])).rowCount, 0);
  });
});
