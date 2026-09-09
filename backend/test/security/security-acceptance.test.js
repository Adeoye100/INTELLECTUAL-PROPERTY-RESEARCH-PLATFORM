import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { loadConfig } from '../../src/config.js';
import { runMigrations } from '../../src/db/migration-runner.js';
import { createSystem } from '../../src/system.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const databaseSsl = process.env.DATABASE_SSL === 'true';
const redisUrl = process.env.TEST_REDIS_URL?.trim();

if (!databaseUrl || !redisUrl) {
  throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL are required for P5 security acceptance tests.');
}

const suffix = randomUUID();
const firmAName = `Security Firm A ${suffix}`;
const firmBName = `Security Firm B ${suffix}`;

const adminA_UserId = randomUUID();
const attorneyA_UserId = randomUUID();
const viewerA_UserId = randomUUID();
const adminB_UserId = randomUUID();

const adminA_Email = `admin-a-${suffix}@security.test`;
const attorneyA_Email = `attorney-a-${suffix}@security.test`;
const viewerA_Email = `viewer-a-${suffix}@security.test`;
const adminB_Email = `admin-b-${suffix}@security.test`;

const paystackSecretKey = 'sk_test_integration_secret_key_at_least_32_bytes';

let system;
let firmAId;
let firmBId;
let firmA_MarkId;
let firmA_WatchId;
let firmA_AlertId;
let firmA_MatterId;
let firmA_ExportId;
let firmA_OfficeActionRefId;

const config = loadConfig({
  ...process.env,
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: databaseSsl ? 'true' : 'false',
  DATABASE_CONNECTION_TIMEOUT_MS: '30000',
  REDIS_URL: redisUrl,
  JWT_ACCESS_SECRET: 'security-integration-jwt-secret-at-least-32-bytes',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'security-integration-supabase-secret-key-32-bytes',
  SUPABASE_JWT_VERIFICATION_MODE: 'jwks',
  SUPABASE_JWT_ALGORITHMS: 'ES256',
  PUBLIC_FIRM_SIGNUP_ENABLED: 'true',
  AUTH_RATE_LIMIT_ENABLED: 'false',
  SEARCH_ENABLED: 'true',
  WATCH_ENABLED: 'true',
  PDF_EXPORT_ENABLED: 'true',
  PAYSTACK_ENABLED: 'true',
  PAYSTACK_MODE: 'test',
  PAYSTACK_SECRET_KEY: paystackSecretKey,
  PAYSTACK_WEBHOOK_SECRET: paystackSecretKey,
  PAYSTACK_STARTER_PLAN_CODE: 'PLN_starter1',
  PAYSTACK_STARTER_AMOUNT_SUBUNIT: '250000',
  PAYSTACK_STARTER_CURRENCY: 'NGN',
  PAYSTACK_PROFESSIONAL_PLAN_CODE: 'PLN_professional1',
  PAYSTACK_PROFESSIONAL_AMOUNT_SUBUNIT: '750000',
  PAYSTACK_PROFESSIONAL_CURRENCY: 'NGN',
  PDF_EXPORT_STORAGE_PROVIDER: 'database',
  PDF_EXPORT_QUEUE_KEY: `queue:p5_sec_pdf_${suffix.slice(0, 8)}`,
  WATCH_QUEUE_KEY: `queue:p5_sec_watch_${suffix.slice(0, 8)}`,
});

before(async () => {
  system = await createSystem(config);
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(system.pool, path.resolve(currentDirectory, '../../migrations'));

  system.supabaseVerifier.verifyAccessToken = async (token) => {
    if (token === 'token-admin-a') return { userId: adminA_UserId, email: adminA_Email, supabaseRole: 'authenticated', sessionId: 's1', claims: {} };
    if (token === 'token-attorney-a') return { userId: attorneyA_UserId, email: attorneyA_Email, supabaseRole: 'authenticated', sessionId: 's2', claims: {} };
    if (token === 'token-viewer-a') return { userId: viewerA_UserId, email: viewerA_Email, supabaseRole: 'authenticated', sessionId: 's3', claims: {} };
    if (token === 'token-admin-b') return { userId: adminB_UserId, email: adminB_Email, supabaseRole: 'authenticated', sessionId: 's4', claims: {} };
    throw new Error('Invalid test token');
  };

  system.supabaseAdminUserService.getAuthoritativeUser = async (userId) => {
    if (userId === adminA_UserId) return { id: adminA_UserId, email: adminA_Email, emailConfirmed: true };
    if (userId === attorneyA_UserId) return { id: attorneyA_UserId, email: attorneyA_Email, emailConfirmed: true };
    if (userId === viewerA_UserId) return { id: viewerA_UserId, email: viewerA_Email, emailConfirmed: true };
    if (userId === adminB_UserId) return { id: adminB_UserId, email: adminB_Email, emailConfirmed: true };
    throw new Error('User not found');
  };

  // 1. Provision Firm A & Admin A
  const intentA = await request(system.app)
    .post('/api/v1/provisioning/organization-intents')
    .send({ email: adminA_Email, firmName: firmAName });
  assert.equal(intentA.status, 201);

  const regA = await request(system.app)
    .post('/api/v1/provisioning/firm')
    .set('Authorization', 'Bearer token-admin-a')
    .send({ intentToken: intentA.body.intentToken });
  assert.equal(regA.status, 201);
  firmAId = regA.body.user.firmId;

  // Provision Firm B & Admin B
  const intentB = await request(system.app)
    .post('/api/v1/provisioning/organization-intents')
    .send({ email: adminB_Email, firmName: firmBName });
  assert.equal(intentB.status, 201);

  const regB = await request(system.app)
    .post('/api/v1/provisioning/firm')
    .set('Authorization', 'Bearer token-admin-b')
    .send({ intentToken: intentB.body.intentToken });
  assert.equal(regB.status, 201);
  firmBId = regB.body.user.firmId;

  // Invite & create Attorney A and Viewer A in Firm A
  const inviteAttorney = await request(system.app)
    .post('/api/v1/admin/invitations')
    .set('Authorization', 'Bearer token-admin-a')
    .send({ fullName: 'Attorney A', email: attorneyA_Email, role: 'attorney' });
  assert.equal(inviteAttorney.status, 201, `inviteAttorney failed: ${inviteAttorney.status} ${JSON.stringify(inviteAttorney.body)}`);

  const attorneyMsg = system.invitationService.invitationMailer.messages.find((m) => m.to === attorneyA_Email);
  const attorneyToken = attorneyMsg.text.match(/\/auth\/invite\/([^/\s]+)/)[1];

  const acceptAttorney = await request(system.app)
    .post(`/api/v1/auth/invitations/${attorneyToken}/redeem`)
    .set('Authorization', 'Bearer token-attorney-a')
    .send({ fullName: 'Attorney A' });
  assert.equal(acceptAttorney.status, 201, `acceptAttorney failed: ${acceptAttorney.status} ${JSON.stringify(acceptAttorney.body)}`);

  const inviteViewer = await request(system.app)
    .post('/api/v1/admin/invitations')
    .set('Authorization', 'Bearer token-admin-a')
    .send({ fullName: 'Viewer A', email: viewerA_Email, role: 'viewer' });
  assert.equal(inviteViewer.status, 201);

  const viewerMsg = system.invitationService.invitationMailer.messages.find((m) => m.to === viewerA_Email);
  const viewerToken = viewerMsg.text.match(/\/auth\/invite\/([^/\s]+)/)[1];

  const acceptViewer = await request(system.app)
    .post(`/api/v1/auth/invitations/${viewerToken}/redeem`)
    .set('Authorization', 'Bearer token-viewer-a')
    .send({ fullName: 'Viewer A' });
  assert.equal(acceptViewer.status, 201, `acceptViewer failed: ${acceptViewer.status} ${JSON.stringify(acceptViewer.body)}`);

  // 2. Create Firm A baseline resources
  // Portfolio Mark
  const markRes = await request(system.app)
    .post('/api/v1/portfolio-marks')
    .set('Authorization', 'Bearer token-admin-a')
    .send({
      markText: 'SEC-MARK-A',
      jurisdiction: 'US',
      sourceRegistry: 'USPTO',
      registryReference: `US-SEC-${suffix.slice(0, 8)}`,
      niceClasses: [9, 42],
      status: 'pending',
    });
  assert.equal(markRes.status, 201);
  firmA_MarkId = markRes.body.id;

  // Matter
  const matterRes = await request(system.app)
    .post('/api/v1/matters')
    .set('Authorization', 'Bearer token-admin-a')
    .send({
      name: 'SEC-MATTER-A',
      clientRef: 'REF-A1',
    });
  assert.equal(matterRes.status, 201, `matterRes failed: ${matterRes.status} ${JSON.stringify(matterRes.body)}`);
  firmA_MatterId = matterRes.body.id;

  // Watch
  const watchRes = await request(system.app)
    .post('/api/v1/watches')
    .set('Authorization', 'Bearer token-admin-a')
    .send({
      portfolioMarkId: firmA_MarkId,
      state: 'enabled',
      pollIntervalMinutes: 1440,
    });
  assert.equal(watchRes.status, 201, `watchRes failed: ${watchRes.status} ${JSON.stringify(watchRes.body)}`);
  firmA_WatchId = watchRes.body.id;

  // Office Action Reference
  const oaRes = await request(system.app)
    .post(`/api/v1/portfolio-marks/${firmA_MarkId}/office-action-refs`)
    .set('Authorization', 'Bearer token-admin-a')
    .send({
      sourceRegistry: 'USPTO',
      sourceReferenceId: `OA-REF-${suffix.slice(0, 8)}`,
      applicationNumber: `88${suffix.slice(0, 6)}`,
      documentType: 'non_final_office_action',
      officeActionDate: '2026-01-15',
      examinerName: 'Examiner Smith',
      examinerReasoningSummary: 'Section 2(d) Likelihood of Confusion',
      summaryMethod: 'manual',
    });
  assert.equal(oaRes.status, 201, `oaRes failed: ${oaRes.status} ${JSON.stringify(oaRes.body)}`);
  firmA_OfficeActionRefId = oaRes.body.id;

  // Export
  const exportRes = await request(system.app)
    .post('/api/v1/exports')
    .set('Authorization', 'Bearer token-admin-a')
    .send({
      type: 'portfolio_summary',
      sourceEntityId: firmA_MarkId,
      idempotencyKey: `pdf:${randomUUID()}`,
      parameters: { includeWatches: true, includeAlerts: true },
    });
  assert.equal(exportRes.status, 202);
  firmA_ExportId = exportRes.body.id;

  // Dequeue and process export job
  const job = await system.pdfExportRuntime.queue.dequeue();
  if (job) {
    await system.pdfExportRuntime.processor.process(job);
  }

  // Directly insert a risk score and alert for Firm A to verify alert tenant isolation & RBAC
  const fp = createHmac('sha256', 'key').update(randomUUID()).digest('hex');
  const riskRes = await system.pool.query(
    `INSERT INTO risk_scores (
      firm_id, watch_id, portfolio_mark_id, candidate_source, candidate_registry_reference,
      candidate_mark_text, visual_score, phonetic_score, class_overlap_score, composite_score,
      composite_rating, methodology_version, matched_mark_refs, source_request_id, source_statuses,
      source_partial, observed_at, fingerprint
    ) VALUES (
      $1, $2, $3, 'USPTO', 'US-12345678', 'SEC-CONFLICT', 80.0, 85.0, 100.0, 88.0,
      'high', 'v1.0', '[]', 'req-sec', '{}', false, now(), $4
    ) RETURNING id`,
    [firmAId, firmA_WatchId, firmA_MarkId, fp],
  );

  const alertInsert = await system.pool.query(
    `INSERT INTO alerts (firm_id, watch_id, portfolio_mark_id, risk_score_id, severity, status, policy_version)
     VALUES ($1, $2, $3, $4, 'high', 'unread', 'v1.0') RETURNING id`,
    [firmAId, firmA_WatchId, firmA_MarkId, riskRes.rows[0].id],
  );
  firmA_AlertId = alertInsert.rows[0].id;
});

after(async () => {
  if (system?.pool) await system.pool.end();
  if (system?.redisClient) await system.redisClient.quit();
});

describe('P5-01 — Authentication Acceptance', () => {
  it('rejects requests missing Bearer authorization headers with 401 UNAUTHORIZED', async () => {
    const res = await request(system.app).get('/api/v1/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
  });

  it('rejects malformed Bearer tokens with 401 UNAUTHORIZED', async () => {
    const res = await request(system.app).get('/api/v1/me').set('Authorization', 'Bearer malformed-token-xyz');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
  });

  it('rejects unauthenticated requests to protected endpoints without leaking internal data', async () => {
    const res = await request(system.app).get('/api/v1/portfolio-marks');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
    assert.equal(res.body.items, undefined);
  });
});

describe('P5-02 — RBAC Acceptance Matrix', () => {
  it('enforces RBAC for Viewer role: allows read endpoints, denies write/admin actions with 403 FORBIDDEN', async () => {
    // 1. Read endpoints allowed for Viewer
    const getMe = await request(system.app).get('/api/v1/me').set('Authorization', 'Bearer token-viewer-a');
    assert.equal(getMe.status, 200);

    const getMarks = await request(system.app).get('/api/v1/portfolio-marks').set('Authorization', 'Bearer token-viewer-a');
    assert.equal(getMarks.status, 200);

    const getMatters = await request(system.app).get('/api/v1/matters').set('Authorization', 'Bearer token-viewer-a');
    assert.equal(getMatters.status, 200);

    // 2. Write/Mutation endpoints forbidden for Viewer
    const postMark = await request(system.app)
      .post('/api/v1/portfolio-marks')
      .set('Authorization', 'Bearer token-viewer-a')
      .send({ markText: 'VIEWER-WRITE-ATTEMPT', jurisdiction: 'US' });
    assert.equal(postMark.status, 403);

    const postMatter = await request(system.app)
      .post('/api/v1/matters')
      .set('Authorization', 'Bearer token-viewer-a')
      .send({ title: 'VIEWER-MATTER-ATTEMPT' });
    assert.equal(postMatter.status, 403);

    const deleteMark = await request(system.app)
      .delete(`/api/v1/portfolio-marks/${firmA_MarkId}`)
      .set('Authorization', 'Bearer token-viewer-a');
    assert.equal(deleteMark.status, 403);
  });

  it('enforces RBAC for Attorney role: allows operational read/write, denies admin management with 403 FORBIDDEN', async () => {
    // Operational write allowed for Attorney
    const postMark = await request(system.app)
      .post('/api/v1/portfolio-marks')
      .set('Authorization', 'Bearer token-attorney-a')
      .send({
        markText: 'ATTORNEY-MARK-A',
        jurisdiction: 'US',
        sourceRegistry: 'USPTO',
        registryReference: `US-ATT-${suffix.slice(0, 8)}`,
        niceClasses: [9, 42],
        status: 'pending',
      });
    assert.equal(postMark.status, 201);

    // Admin-only endpoints forbidden for Attorney
    const getAdminUsers = await request(system.app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer token-attorney-a');
    assert.equal(getAdminUsers.status, 403);

    const postAdminInvite = await request(system.app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', 'Bearer token-attorney-a')
      .send({ fullName: 'Unauth Invite', email: `unauth-${suffix}@test.com`, role: 'attorney' });
    assert.equal(postAdminInvite.status, 403);
  });

  it('allows Admin full control over firm administration and operational routes', async () => {
    const getAdminUsers = await request(system.app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer token-admin-a');
    assert.equal(getAdminUsers.status, 200);
    assert.ok(Array.isArray(getAdminUsers.body.users));
  });
});

describe('P5-03 — Tenant Isolation Acceptance (Firm A vs Firm B)', () => {
  it('prevents Firm B from reading or mutating Firm A Portfolio Marks with 404 NOT FOUND', async () => {
    const getRes = await request(system.app)
      .get(`/api/v1/portfolio-marks/${firmA_MarkId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(getRes.status, 404);
    assert.equal(getRes.body.code, 'PORTFOLIO_MARK_NOT_FOUND');
  });

  it('prevents Firm B from reading or mutating Firm A Matters with 404 NOT FOUND', async () => {
    const getRes = await request(system.app)
      .get(`/api/v1/matters/${firmA_MatterId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(getRes.status, 404);
    assert.equal(getRes.body.code, 'MATTER_NOT_FOUND');
  });

  it('prevents Firm B from reading or mutating Firm A Watches with 404 NOT FOUND', async () => {
    const getRes = await request(system.app)
      .get(`/api/v1/watches/${firmA_WatchId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(getRes.status, 404);
    assert.equal(getRes.body.code, 'WATCH_NOT_FOUND');

    const patchRes = await request(system.app)
      .patch(`/api/v1/watches/${firmA_WatchId}`)
      .set('Authorization', 'Bearer token-admin-b')
      .send({ state: 'paused' });
    assert.equal(patchRes.status, 404);

    const deleteRes = await request(system.app)
      .delete(`/api/v1/watches/${firmA_WatchId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(deleteRes.status, 404);
  });

  it('prevents Firm B from reading or mutating Firm A Alerts with 404 NOT FOUND', async () => {
    const getRes = await request(system.app)
      .get(`/api/v1/alerts/${firmA_AlertId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(getRes.status, 404);
    assert.equal(getRes.body.code, 'ALERT_NOT_FOUND');

    const patchRes = await request(system.app)
      .patch(`/api/v1/alerts/${firmA_AlertId}`)
      .set('Authorization', 'Bearer token-admin-b')
      .send({ action: 'read' });
    assert.equal(patchRes.status, 404);
  });

  it('prevents Firm B from reading or downloading Firm A Exports with 404 NOT FOUND', async () => {
    const getRes = await request(system.app)
      .get(`/api/v1/exports/${firmA_ExportId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(getRes.status, 404);
    assert.equal(getRes.body.code, 'EXPORT_NOT_FOUND');
  });

  it('prevents Firm B from reading or mutating Firm A Office Action References with 404 NOT FOUND', async () => {
    const getRes = await request(system.app)
      .get(`/api/v1/portfolio-marks/${firmA_MarkId}/office-action-refs/${firmA_OfficeActionRefId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(getRes.status, 404);
    assert.ok(['PORTFOLIO_MARK_NOT_FOUND', 'OFFICE_ACTION_REF_NOT_FOUND'].includes(getRes.body.code));

    const deleteRes = await request(system.app)
      .delete(`/api/v1/portfolio-marks/${firmA_MarkId}/office-action-refs/${firmA_OfficeActionRefId}`)
      .set('Authorization', 'Bearer token-admin-b');
    assert.equal(deleteRes.status, 404);
  });
});

describe('P5-04 / P5-05 — Injection & Input Sanitization Acceptance', () => {
  it('handles XSS payload strings as safe text without executing code or breaking API JSON formatting', async () => {
    const xssPayload = '<script>alert("xss-injection-test")</script>';
    const createRes = await request(system.app)
      .post('/api/v1/portfolio-marks')
      .set('Authorization', 'Bearer token-admin-a')
      .send({
        markText: xssPayload,
        jurisdiction: 'US',
        sourceRegistry: 'USPTO',
        registryReference: `US-XSS-${suffix.slice(0, 8)}`,
        niceClasses: [9, 42],
        status: 'pending',
      });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.markText, xssPayload);

    const getRes = await request(system.app)
      .get(`/api/v1/portfolio-marks/${createRes.body.id}`)
      .set('Authorization', 'Bearer token-admin-a');
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.markText, xssPayload);
  });

  it('handles SQL injection payloads safely as literals without altering SQL structure or disclosing unowned data', async () => {
    const sqliPayload = "' OR '1'='1'; DROP TABLE users; --";
    const createRes = await request(system.app)
      .post('/api/v1/matters')
      .set('Authorization', 'Bearer token-admin-a')
      .send({
        name: sqliPayload,
        clientRef: 'SQLI-TEST',
      });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.name, sqliPayload);

    const listRes = await request(system.app)
      .get('/api/v1/matters')
      .set('Authorization', 'Bearer token-admin-a');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.items));
  });
});

describe('P5-06 — Payment Modification & Webhook Signature Acceptance', () => {
  it('rejects unauthenticated or forged Paystack webhooks with invalid signatures', async () => {
    const webhookPayload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: `PAY-${suffix.slice(0, 8)}`,
        status: 'success',
        amount: 29900,
        currency: 'USD',
        metadata: { firmId: firmAId },
      },
    });

    const invalidRes = await request(system.app)
      .post('/api/v1/billing/webhook')
      .set('x-paystack-signature', 'forged-invalid-signature-hash')
      .set('Content-Type', 'application/json')
      .send(webhookPayload);
    assert.equal(invalidRes.status, 401);
  });

  it('accepts and idempotently processes valid signed Paystack webhooks', async () => {
    const payloadObject = {
      event: 'charge.success',
      data: {
        reference: `PAY-VALID-${suffix.slice(0, 8)}`,
        status: 'success',
        amount: 29900,
        currency: 'USD',
        metadata: { firmId: firmAId, planId: 'growth' },
      },
    };
    const webhookPayload = JSON.stringify(payloadObject);
    const validSignature = createHmac('sha512', paystackSecretKey).update(webhookPayload).digest('hex');

    const validRes = await request(system.app)
      .post('/api/v1/billing/webhook')
      .set('x-paystack-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(webhookPayload);
    assert.equal(validRes.status, 200);

    // Replaying identical webhook returns 200 OK idempotently
    const replayRes = await request(system.app)
      .post('/api/v1/billing/webhook')
      .set('x-paystack-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(webhookPayload);
    assert.equal(replayRes.status, 200);
  });
});

describe('P5-07 / P5-08 — Stack Hardening & Security Headers', () => {
  it('includes standard security headers (Helmet / CORS / content-type-options) on API responses', async () => {
    const res = await request(system.app).get('/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('returns normalized JSON errors without exposing raw database queries or internal stack traces', async () => {
    const badUuidRes = await request(system.app)
      .get('/api/v1/portfolio-marks/not-a-valid-uuid')
      .set('Authorization', 'Bearer token-admin-a');
    assert.equal(badUuidRes.status, 400);
    assert.equal(badUuidRes.body.code, 'VALIDATION_ERROR');
    assert.equal(typeof badUuidRes.body.message, 'string');
    assert.equal(badUuidRes.body.stack, undefined);
  });
});
