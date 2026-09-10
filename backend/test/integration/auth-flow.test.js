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
const signupInviteSupabaseUserId = randomUUID();
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
  watchPollIntervalMinutes: 1440,
  publicFirmSignupEnabled: true,
  organizationIntentTtlSeconds: 86400,
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
    if (token === 'signup-invite-token') {
      return {
        userId: signupInviteSupabaseUserId,
        email: signupInviteEmail,
        supabaseRole: 'authenticated',
        sessionId: 'signup-invite-session',
        claims: {},
      };
    }
    throw Object.assign(new Error('invalid test token'), { code: 'TEST_TOKEN_INVALID' });
  };
  system.supabaseAdminUserService.getAuthoritativeUser = async (userId) => {
    if (userId === adminSupabaseUserId) return { id: adminSupabaseUserId, email: adminEmail, emailConfirmed: true };
    if (userId === blockedSupabaseUserId) return { id: blockedSupabaseUserId, email: blockedEmail, emailConfirmed: true };
    if (userId === invitedSupabaseUserId) return { id: invitedSupabaseUserId, email: invitedEmail, emailConfirmed: true };
    if (userId === signupInviteSupabaseUserId) return { id: signupInviteSupabaseUserId, email: signupInviteEmail, emailConfirmed: true };
    throw new Error('User not found');
  };

  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(system.pool, path.resolve(currentDirectory, '../../migrations'));
  assert.equal((await system.redisClient.ping()), 'PONG');
  assert.equal((await system.pool.query('SELECT 1 AS connected')).rows[0].connected, 1);
});

after(async () => {
  if (!system) return;
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
      'expires_at', 'used_at', 'created_at', 'token_hash', 'revoked_at',
      'accepted_at', 'superseded_by', 'last_sent_at',
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
    const intent = await request(system.app)
      .post('/api/v1/provisioning/organization-intents')
      .send({ email: adminEmail, firmName });
    assert.equal(intent.status, 201);

    const provisioning = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer admin-signup-token')
      .send({ intentToken: intent.body.intentToken });
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
      .send({ intentToken: intent.body.intentToken });
    assert.equal(repeated.status, 201);
    assert.equal(repeated.body.user.firmId, firmId);
    assert.equal((await system.pool.query(
      'SELECT count(*)::int AS count FROM firms WHERE id = $1',
      [firmId],
    )).rows[0].count, 1);
  });

  it('blocks firm provisioning when the normalized firm name already exists', async () => {
    const intent = await request(system.app)
      .post('/api/v1/provisioning/organization-intents')
      .send({ email: blockedEmail, firmName: `  ${firmName.toUpperCase()}  ` });
    assert.equal(intent.status, 201);

    const provisioning = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer blocked-signup-token')
      .send({ intentToken: intent.body.intentToken });
    assert.equal(provisioning.status, 409);
    assert.equal(provisioning.body.code, 'FIRM_ALREADY_EXISTS');
    assert.match(provisioning.body.message, /request an invitation/i);
    assert.equal((await system.pool.query('SELECT 1 FROM users WHERE email = $1', [blockedEmail])).rowCount, 0);
  });

  it('lets an Admin issue a signed invite and joins with its intended firm and role', async () => {
    const inviteRes = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', 'Bearer admin-signup-token')
      .send({ fullName: 'Invited Viewer', email: invitedEmail, role: 'viewer' });
    assert.equal(inviteRes.status, 201);

    const message = system.invitationService.invitationMailer.messages.find((m) => m.to === invitedEmail);
    acceptedInviteToken = message.text.match(/\/auth\/invite\/([^/\s]+)/)[1];

    const details = await request(system.app)
      .get(`/api/v1/auth/invitations/${acceptedInviteToken}`);
    assert.equal(details.status, 200);
    assert.equal(details.body.email, invitedEmail);
    assert.equal(details.body.firmName, firmName);
    assert.equal(details.body.role, 'viewer');

    const accepted = await request(system.app)
      .post(`/api/v1/auth/invitations/${acceptedInviteToken}/redeem`)
      .set('Authorization', 'Bearer invited-first-use-token')
      .send({ fullName: 'Invited Viewer' });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.firm.id, firmId);
    assert.equal(accepted.body.user.role, 'viewer');
    assert.equal(accepted.body.user.email, invitedEmail);
  });

  it('ignores caller-supplied role and firm when redeeming an invite', async () => {
    const inviteRes = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', 'Bearer admin-signup-token')
      .send({ fullName: 'Invited Attorney', email: signupInviteEmail, role: 'attorney' });
    assert.equal(inviteRes.status, 201);

    const message = system.invitationService.invitationMailer.messages.find((m) => m.to === signupInviteEmail);
    const token = message.text.match(/\/auth\/invite\/([^/\s]+)/)[1];

    const accepted = await request(system.app)
      .post(`/api/v1/auth/invitations/${token}/redeem`)
      .set('Authorization', 'Bearer signup-invite-token')
      .send({ fullName: 'Invited Attorney' });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.firm.id, firmId);
    assert.equal(accepted.body.user.role, 'attorney');
    assert.equal(accepted.body.firm.name, firmName);
  });

  it('rejects reuse of an accepted invitation with a clear error', async () => {
    const replay = await request(system.app)
      .post(`/api/v1/auth/invitations/${acceptedInviteToken}/redeem`)
      .set('Authorization', 'Bearer invited-first-use-token')
      .send({ fullName: 'Invited Viewer' });
    assert.equal(replay.status, 410);
    assert.equal(replay.body.code, 'EXPIRED_LINK');
  });

  it('rejects an expired invitation with a clear error', async () => {
    const inviteRes = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', 'Bearer admin-signup-token')
      .send({ fullName: 'Expired Invite', email: expiredEmail, role: 'attorney' });
    assert.equal(inviteRes.status, 201);

    const message = system.invitationService.invitationMailer.messages.find((m) => m.to === expiredEmail);
    const token = message.text.match(/\/auth\/invite\/([^/\s]+)/)[1];

    await system.pool.query(
      `UPDATE firm_invitations
       SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
       WHERE email = $1`,
      [expiredEmail],
    );
    const expired = await request(system.app)
      .post(`/api/v1/auth/invitations/${token}/redeem`)
      .set('Authorization', 'Bearer invited-first-use-token')
      .send({ fullName: 'Expired Invite' });
    assert.equal(expired.status, 410);
    assert.equal(expired.body.code, 'EXPIRED_LINK');
    assert.equal((await system.pool.query('SELECT 1 FROM users WHERE email = $1', [expiredEmail])).rowCount, 0);
  });
});
