import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
  throw new Error(
    'Real integration stores are required. Set TEST_DATABASE_URL and TEST_REDIS_URL; '
    + 'the documented compose setup provides both.',
  );
}

const suffix = randomUUID();
const firm1Name = `Export Firm A ${suffix}`;
const firm2Name = `Export Firm B ${suffix}`;
const admin1Email = `admin-a-${suffix}@example.test`;
const admin2Email = `admin-b-${suffix}@example.test`;
const admin1SupabaseUserId = randomUUID();
const admin2SupabaseUserId = randomUUID();
const password = 'integration-password';

let system;
let firm1Id;
let firm2Id;
let token1;
let token2;
let portfolioMarkId;

const config = loadConfig({
  ...process.env,
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: databaseSsl ? 'true' : 'false',
  DATABASE_CONNECTION_TIMEOUT_MS: '30000',
  REDIS_URL: redisUrl,
  JWT_ACCESS_SECRET: 'integration-only-secret-that-is-at-least-32-bytes',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'integration-only-supabase-secret-key-at-least-32-bytes',
  SUPABASE_JWT_VERIFICATION_MODE: 'jwks',
  SUPABASE_JWT_ALGORITHMS: 'ES256',
  PUBLIC_FIRM_SIGNUP_ENABLED: 'true',
  AUTH_RATE_LIMIT_ENABLED: 'false',
  WATCH_ENABLED: 'false',
  PDF_EXPORT_ENABLED: 'true',
  PDF_EXPORT_STORAGE_PROVIDER: 'database',
  PDF_EXPORT_QUEUE_KEY: `queue:pdf_export_test_${suffix.slice(0, 8)}`,
});

before(async () => {
  system = await createSystem(config);
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
    await runMigrations(system.pool, path.resolve(currentDirectory, '../../migrations'));

    system.supabaseVerifier.verifyAccessToken = async (token) => {
      if (token === 'token-firm-1') {
        return {
          userId: admin1SupabaseUserId,
          email: admin1Email,
          supabaseRole: 'authenticated',
          sessionId: 'session-1',
          claims: {},
        };
      }
      if (token === 'token-firm-2') {
        return {
          userId: admin2SupabaseUserId,
          email: admin2Email,
          supabaseRole: 'authenticated',
          sessionId: 'session-2',
          claims: {},
        };
      }
      throw new Error('Invalid test token');
    };

    system.supabaseAdminUserService.getAuthoritativeUser = async (userId) => {
      if (userId === admin1SupabaseUserId) return { id: admin1SupabaseUserId, email: admin1Email, emailConfirmed: true };
      if (userId === admin2SupabaseUserId) return { id: admin2SupabaseUserId, email: admin2Email, emailConfirmed: true };
      throw new Error('User not found');
    };

    // Provision Firm 1 & Admin 1
    const intent1 = await request(system.app)
      .post('/api/v1/provisioning/organization-intents')
      .send({ email: admin1Email, firmName: firm1Name });
    assert.equal(intent1.status, 201, `intent1 failed: ${intent1.status} ${JSON.stringify(intent1.body)}`);

    const reg1 = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer token-firm-1')
      .send({ intentToken: intent1.body.intentToken });
    assert.equal(reg1.status, 201, `reg1 failed: ${reg1.status} ${JSON.stringify(reg1.body)}`);
    firm1Id = reg1.body.user.firmId;

    // Provision Firm 2 & Admin 2
    const intent2 = await request(system.app)
      .post('/api/v1/provisioning/organization-intents')
      .send({ email: admin2Email, firmName: firm2Name });
    assert.equal(intent2.status, 201, `intent2 failed: ${intent2.status} ${JSON.stringify(intent2.body)}`);

    const reg2 = await request(system.app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer token-firm-2')
      .send({ intentToken: intent2.body.intentToken });
    assert.equal(reg2.status, 201, `reg2 failed: ${reg2.status} ${JSON.stringify(reg2.body)}`);
    firm2Id = reg2.body.user.firmId;

    // Create a portfolio mark in Firm 1
    const markRes = await request(system.app)
      .post('/api/v1/portfolio-marks')
      .set('Authorization', 'Bearer token-firm-1')
      .send({
        markText: 'FORGE PDF TEST',
        jurisdiction: 'US',
        sourceRegistry: 'USPTO',
        registryReference: `US-${suffix.slice(0, 8)}`,
        niceClasses: [9, 42],
        status: 'pending',
      });
    assert.equal(markRes.status, 201, `markRes failed: ${markRes.status} ${JSON.stringify(markRes.body)}`);
    portfolioMarkId = markRes.body.id;
});

after(async () => {
  if (system?.pool) await system.pool.end();
  if (system?.redisClient) await system.redisClient.quit();
});

describe('Shared PostgreSQL PDF Export Storage & Cross-Tenant Isolation', () => {
  it('processes worker job into database storage and enforces cross-tenant 404 isolation', async () => {
    // 1. POST /exports for Firm 1
    const createRes = await request(system.app)
      .post('/api/v1/exports')
      .set('Authorization', 'Bearer token-firm-1')
      .send({
        type: 'portfolio_summary',
        sourceEntityId: portfolioMarkId,
        idempotencyKey: `pdf:${randomUUID()}`,
        parameters: { includeWatches: true, includeAlerts: true },
      });
    assert.equal(createRes.status, 202, `POST /exports status failed: ${createRes.status} ${JSON.stringify(createRes.body)}`);
    const exportId = createRes.body.id;
    assert.equal(createRes.body.status, 'queued');

    // 2. Run worker processor once to process the job
    const job = await system.pdfExportRuntime.queue.dequeue();
    assert.ok(job, 'Expected a queued export job');
    const processResult = await system.pdfExportRuntime.processor.process(job);
    assert.equal(processResult.outcome, 'completed');

    // 3. GET /exports/:id as Firm 1 -> should show completed
    const getRes1 = await request(system.app)
      .get(`/api/v1/exports/${exportId}`)
      .set('Authorization', 'Bearer token-firm-1');
    assert.equal(getRes1.status, 200);
    assert.equal(getRes1.body.status, 'completed');

    // 4. Verify artifact saved in database export_artifacts table
    const artifactQuery = await system.pool.query(
      'SELECT export_id, byte_size, checksum_sha256 FROM export_artifacts WHERE firm_id = $1 AND export_id = $2',
      [firm1Id, exportId],
    );
    assert.equal(artifactQuery.rows.length, 1);
    assert.ok(artifactQuery.rows[0].byte_size > 0);

    // 5. GET /exports/:id/download as Firm 1 -> 200 OK with PDF body
    const downloadRes1 = await request(system.app)
      .get(`/api/v1/exports/${exportId}/download`)
      .set('Authorization', 'Bearer token-firm-1');
    assert.equal(downloadRes1.status, 200);
    assert.equal(downloadRes1.headers['content-type'], 'application/pdf');
    assert.match(downloadRes1.body.toString('binary'), /%PDF/);

    // 6. GET /exports/:id as Firm 2 -> 404 NOT FOUND (Cross-tenant isolation)
    const getRes2 = await request(system.app)
      .get(`/api/v1/exports/${exportId}`)
      .set('Authorization', 'Bearer token-firm-2');
    assert.equal(getRes2.status, 404);
    assert.equal(getRes2.body.code, 'EXPORT_NOT_FOUND');

    // 7. GET /exports/:id/download as Firm 2 -> 404 NOT FOUND (Cross-tenant isolation)
    const downloadRes2 = await request(system.app)
      .get(`/api/v1/exports/${exportId}/download`)
      .set('Authorization', 'Bearer token-firm-2');
    assert.equal(downloadRes2.status, 404);
    assert.equal(downloadRes2.body.code, 'EXPORT_NOT_FOUND');
  });
});
