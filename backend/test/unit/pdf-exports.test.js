import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { AppError, errorHandler, unauthorized } from '../../src/errors.js';
import { loadConfig } from '../../src/config.js';
import { ExportRepository } from '../../src/exports/export-repository.js';
import { ExportService } from '../../src/exports/export-service.js';
import { ExportSourceLoader } from '../../src/exports/export-source-loader.js';
import { createExportDocumentModel } from '../../src/exports/export-document-model.js';
import { PdfRenderer } from '../../src/exports/pdf-renderer.js';
import { InMemoryPdfStorage, exportStorageKey, validateExportStorageKey } from '../../src/exports/export-storage.js';
import { deterministicPdfExportJobId, validatePdfExportJob } from '../../src/exports/pdf-export-queue.js';
import { PdfExportProcessor } from '../../src/exports/pdf-export-processor.js';
import { createExportRouter } from '../../src/routes/export-routes.js';
import { createApp } from '../../src/app.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const exportId = '44444444-4444-4444-8444-444444444444';
const sourceEntityId = '55555555-5555-4555-8555-555555555555';
const createdAt = '2026-08-22T00:00:00.000Z';

function input(overrides = {}) {
  return { type: 'search_results', sourceEntityId, parameters: {}, idempotencyKey: 'export-key-1', ...overrides };
}
function exportRecord(overrides = {}) {
  return {
    id: exportId, firmId, requestedByUserId: 'local-user', requestedByActorUserId: actorUserId,
    type: 'search_results', status: 'queued', sourceEntityId, requestId: 'request-1', idempotencyKey: 'export-key-1',
    parameters: {}, storageKey: null, mimeType: null, byteSize: null, checksumSha256: null, failureCode: null,
    queuedAt: createdAt, processingStartedAt: null, completedAt: null, failedAt: null, createdAt, updatedAt: createdAt,
    ...overrides,
  };
}
function repository({ initial = [] } = {}) {
  const state = { records: structuredClone(initial), committed: 0, rolledBack: 0 };
  const find = (id) => state.records.find((item) => item.id === id);
  return {
    state,
    async withTransaction(work) {
      const before = structuredClone(state.records);
      try { const value = await work({ async query() {} }); state.committed += 1; return value; }
      catch (error) { state.records = before; state.rolledBack += 1; throw error; }
    },
    async insert({ exportRecord: record, actorUserId: actor }) {
      if (state.records.some((item) => item.firmId === record.firmId && item.idempotencyKey === record.idempotencyKey)) return null;
      const stored = exportRecord({ ...record, requestedByActorUserId: actor, requestedByUserId: 'local-user', status: 'queued', createdAt: record.queuedAt, updatedAt: record.queuedAt });
      state.records.push(stored); return structuredClone(stored);
    },
    async findByIdempotencyKeyForFirm({ firmId: scopedFirm, idempotencyKey }) {
      const found = state.records.find((item) => item.firmId === scopedFirm && item.idempotencyKey === idempotencyKey);
      return found ? structuredClone(found) : null;
    },
    async findByIdForFirm({ firmId: scopedFirm, exportId: id }) {
      const found = state.records.find((item) => item.firmId === scopedFirm && item.id === id);
      return found ? structuredClone(found) : null;
    },
    async listForFirm({ firmId: scopedFirm, actorUserId: actor, filters, pagination }) {
      return state.records.filter((item) => item.firmId === scopedFirm)
        .filter((item) => !actor || item.requestedByActorUserId === actor)
        .filter((item) => !filters.status || item.status === filters.status).filter((item) => !filters.type || item.type === filters.type)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
        .slice(0, pagination.pageSize + 1).map((item) => structuredClone(item));
    },
    async claimQueued({ exportId: id, firmId: scopedFirm, processingStartedAt }) {
      const found = find(id); if (!found || found.firmId !== scopedFirm || found.status !== 'queued') return null;
      found.status = 'processing'; found.processingStartedAt = processingStartedAt; found.updatedAt = processingStartedAt; return structuredClone(found);
    },
    async complete({ exportId: id, firmId: scopedFirm, storageKey, byteSize, checksumSha256, completedAt }) {
      const found = find(id); if (!found || found.firmId !== scopedFirm || found.status !== 'processing') return null;
      Object.assign(found, { status: 'completed', storageKey, mimeType: 'application/pdf', byteSize, checksumSha256, completedAt, failedAt: null, failureCode: null, updatedAt: completedAt });
      return structuredClone(found);
    },
    async requeue({ exportId: id, firmId: scopedFirm, updatedAt }) {
      const found = find(id); if (!found || found.firmId !== scopedFirm || found.status !== 'processing') return null;
      Object.assign(found, { status: 'queued', processingStartedAt: null, updatedAt }); return structuredClone(found);
    },
    async fail({ exportId: id, firmId: scopedFirm, failureCode, failedAt }) {
      const found = find(id); if (!found || found.firmId !== scopedFirm || !['queued', 'processing'].includes(found.status)) return null;
      Object.assign(found, { status: 'failed', failureCode, failedAt, updatedAt: failedAt }); return structuredClone(found);
    },
  };
}
function queue({ fail = false } = {}) {
  const jobs = [];
  return {
    jobs,
    async enqueue(job) { if (fail) throw new Error('queue'); jobs.push(structuredClone(job)); return { enqueued: true }; },
    async acquireProcessingLock() { return 'lock'; }, async releaseProcessingLock() {},
  };
}
function audit({ fail = false } = {}) {
  const calls = [];
  const invoke = (kind) => async (payload) => { calls.push([kind, payload]); if (fail) throw new Error('audit'); };
  return { calls, requested: invoke('requested'), completed: invoke('completed'), failed: invoke('failed') };
}
function service(options = {}) {
  const repo = options.repository ?? repository(); const jobs = options.queue ?? queue(); const events = options.audit ?? audit(); const storage = options.storage ?? new InMemoryPdfStorage();
  return {
    repo, jobs, events, storage,
    service: new ExportService({ repository: repo, queue: jobs, exportAuditService: events, storage, clock: () => new Date(createdAt), idGenerator: () => exportId, maxAttempts: 3 }),
  };
}
function snapshot() {
  return {
    id: sourceEntityId, requestId: 'search-request-1', query: { mark: 'FORGE', jurisdictions: ['US'], niceClasses: [9], status: null, owner: null, filedFrom: null, filedTo: null },
    results: [{
      id: 'USPTO-123', searchId: sourceEntityId, candidateMarkText: 'FORGE GLOBAL', candidateSource: 'USPTO', candidateRef: 'US-123', owner: null,
      jurisdiction: 'US', niceClasses: [9], filingDate: null, status: 'registered', riskAnalysis: {
        compositeRating: 'high', compositeScore: 90, visualScore: 91, phoneticScore: 88, classOverlap: true, classOverlapScore: 100, conceptualScore: null,
        methodology: { version: 'risk-v1', description: 'Stored evidence only.' }, matchedMarkRefs: [{ type: 'Visual', score: 91, evidence: 'Similar word structure.' }],
      },
    }], sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 1 }, { source: 'EUIPO', status: 'unavailable', resultCount: 0 }],
    partial: true, methodologyVersions: ['risk-v1'], createdAt,
  };
}

describe('BE-20 export schema, validation, and configuration', () => {
  it('defines additive export lifecycle schema, integrity constraints, and indexes', async () => {
    const migration = await readFile(new URL('../../migrations/012_create_exports.sql', import.meta.url), 'utf8');
    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS exports', 'firm_id uuid NOT NULL REFERENCES firms(id)', 'requested_by_user_id uuid NOT NULL REFERENCES users(id)',
      'export_type varchar(40) NOT NULL', 'status varchar(20) NOT NULL', 'source_entity_id uuid NOT NULL', 'parameters jsonb NOT NULL DEFAULT',
      'exports_firm_idempotency_key', 'exports_completed_state_consistent', 'exports_failed_state_consistent',
      'exports_firm_status_created_id_idx', 'exports_firm_requester_created_id_idx', 'exports_firm_source_entity_idx',
    ]) assert.match(migration, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('keeps exports disabled by default and rejects incomplete enabled configuration', () => {
    const env = {
      SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'secret', SUPABASE_JWT_VERIFICATION_MODE: 'jwks', SUPABASE_JWT_ALGORITHMS: 'ES256',
      DATABASE_URL: 'postgresql://localhost/iprp', REDIS_URL: 'redis://localhost:6379', JWT_ACCESS_SECRET: 'a'.repeat(32), AUTH_RATE_LIMIT_KEY_SECRET: 'b'.repeat(32),
    };
    assert.equal(loadConfig(env).pdfExportEnabled, false);
    assert.throws(() => loadConfig({ ...env, PDF_EXPORT_ENABLED: 'true' }), /PDF_EXPORT_STORAGE_PROVIDER/);
    const enabled = loadConfig({ ...env, PDF_EXPORT_ENABLED: 'true', PDF_EXPORT_STORAGE_PROVIDER: 'filesystem', PDF_EXPORT_STORAGE_ROOT: '/private/exports' });
    assert.equal(enabled.pdfExportQueueKey, 'queue:pdf_export');
  });
});

describe('Export creation, lifecycle auditing, and firm isolation', () => {
  it('creates a queued export once, audits it in the same transaction, and makes equivalent retries idempotent', async () => {
    const setup = service();
    const first = await setup.service.createExport({ firmId, actorUserId, input: input(), requestContext: { requestId: 'request-1' } });
    const retry = await setup.service.createExport({ firmId, actorUserId, input: input(), requestContext: { requestId: 'request-2' } });
    assert.equal(first.created, true); assert.equal(first.export.status, 'queued'); assert.equal(retry.created, false);
    assert.equal(setup.repo.state.records.length, 1); assert.equal(setup.jobs.jobs.length, 1); assert.equal(setup.events.calls[0][0], 'requested');
    assert.equal(setup.events.calls[0][1].transaction !== null, true);
    assert.equal(Object.hasOwn(first.export, 'storageKey'), false);
    await assert.rejects(() => setup.service.createExport({ firmId, actorUserId, input: input({ type: 'portfolio_summary' }) }), { code: 'EXPORT_IDEMPOTENCY_CONFLICT' });
    await assert.rejects(() => setup.service.getExport({ firmId: otherFirmId, exportId }), { code: 'EXPORT_NOT_FOUND' });
    await assert.rejects(() => setup.service.listExports({ firmId, actorUserId, role: 'admin', query: { cursor: 'not-a-cursor' } }), { code: 'EXPORT_CURSOR_INVALID' });
    const unavailable = service({ queue: queue({ fail: true }) });
    await assert.rejects(() => unavailable.service.createExport({ firmId, actorUserId, input: input({ idempotencyKey: 'queue-down' }) }), { code: 'EXPORT_QUEUE_UNAVAILABLE' });
    assert.deepEqual(unavailable.events.calls.map(([kind]) => kind), ['requested', 'failed']);
    assert.equal(unavailable.repo.state.records[0].failureCode, 'EXPORT_QUEUE_UNAVAILABLE');
  });

  it('rejects unsafe parameters and never trusts a caller-provided firm or actor field', async () => {
    const setup = service();
    await assert.rejects(() => setup.service.createExport({ firmId, actorUserId, input: { ...input(), firmId: otherFirmId } }), { code: 'EXPORT_REQUEST_INVALID' });
    await assert.rejects(() => setup.service.createExport({ firmId, actorUserId, input: input({ type: 'risk_report', parameters: { resultId: '<script>' } }) }), { code: 'EXPORT_REQUEST_INVALID' });
    await assert.rejects(() => setup.service.createExport({ firmId: 'bad', actorUserId, input: input() }), { code: 'FORBIDDEN' });
  });

  it('keeps export repository SQL scoped and exposes lifecycle changes rather than delete operations', async () => {
    const calls = []; const row = { id: exportId, firm_id: firmId, requested_by_user_id: sourceEntityId, export_type: 'search_results', status: 'queued', source_entity_id: sourceEntityId, request_id: 'r', idempotency_key: 'k', parameters: {}, storage_key: null, mime_type: null, byte_size: null, checksum_sha256: null, failure_code: null, queued_at: new Date(createdAt), processing_started_at: null, completed_at: null, failed_at: null, created_at: new Date(createdAt), updated_at: new Date(createdAt) };
    const client = { async query(sql, values = []) { calls.push([sql, values]); return { rowCount: 1, rows: [row] }; }, release() {} };
    const repo = new ExportRepository({ async query(sql, values = []) { calls.push([sql, values]); return { rowCount: 1, rows: [row] }; }, async connect() { return client; } });
    await repo.findByIdForFirm({ firmId, exportId }); await repo.listForFirm({ firmId, filters: { status: null, type: null }, pagination: { pageSize: 1, cursor: null } });
    const sql = calls.map(([statement]) => statement).join('\n');
    assert.match(sql, /WHERE exports\.firm_id = \$1 AND exports\.id = \$2/); assert.match(sql, /ORDER BY created_at DESC, id DESC/); assert.equal(sql.includes(firmId), false);
    assert.equal(ExportRepository.prototype.delete, undefined);
  });
});

describe('Persisted source reuse and safe deterministic document models', () => {
  it('loads exact historical risk evidence without Elasticsearch or risk recalculation and preserves nulls', async () => {
    let loaded = 0;
    const loader = new ExportSourceLoader({
      searchResultService: { async loadSearchSnapshotForExport() { loaded += 1; return snapshot(); } },
      portfolioMarkService: { async getPortfolioMark() { throw new Error('not called'); } },
      officeActionRefService: { async listOfficeActionRefs() { throw new Error('not called'); } },
    });
    const model = await loader.load(exportRecord());
    assert.equal(loaded, 1); assert.equal(model.results[0].owner, null); assert.equal(model.results[0].risk.conceptualScore, null);
    assert.equal(model.results[0].candidateRef, 'US-123'); assert.equal(model.partial, true);
    const risk = await loader.load(exportRecord({ type: 'risk_report', parameters: { resultId: 'USPTO-123' } }));
    assert.equal(risk.result.risk.visualScore, 91); assert.equal(risk.result.risk.phoneticScore, 88); assert.equal(risk.result.risk.classOverlapScore, 100);
    const document = createExportDocumentModel(model); const lines = document.sections.flatMap((section) => section.lines).join('\n');
    assert.match(lines, /Partial — one or more sources were unavailable/); assert.match(lines, /Visual evidence score/); assert.match(lines, /Not available/);
  });

  it('firm-scopes portfolio summaries and excludes internal portfolio/user identifiers', async () => {
    const loader = new ExportSourceLoader({
      searchResultService: { async loadSearchSnapshotForExport() { throw new Error('not called'); } },
      portfolioMarkService: { async getPortfolioMark({ firmId: scoped }) { assert.equal(scoped, firmId); return { id: sourceEntityId, firmId, markText: 'FORGE', jurisdiction: 'US', sourceRegistry: 'USPTO', registryReference: 'US-9', niceClasses: [9], status: 'filed', filingDate: null, registrationDate: null, renewalDate: null, ownerUserId: actorUserId }; } },
      officeActionRefService: { async listOfficeActionRefs() { return { items: [] }; } }, watchService: { async listWatches() { return { items: [] }; } }, alertService: { async listAlerts() { return { items: [] }; } },
    });
    const model = await loader.load(exportRecord({ type: 'portfolio_summary', parameters: {} }));
    assert.equal(Object.hasOwn(model.portfolioMark, 'id'), false); assert.equal(Object.hasOwn(model.portfolioMark, 'ownerUserId'), false);
  });
});

describe('Renderer, private storage, queue job, and worker boundaries', () => {
  it('renders escaped static PDF text with page numbering, attribution, disclaimer, and bounded pages', async () => {
    const document = createExportDocumentModel({ ...snapshot(), kind: 'risk_report', sourceAttribution: 'Persisted search snapshot', result: (await new ExportSourceLoader({ searchResultService: { async loadSearchSnapshotForExport() { return snapshot(); } }, portfolioMarkService: { async getPortfolioMark() {} }, officeActionRefService: { async listOfficeActionRefs() {} } }).load(exportRecord({ type: 'risk_report', parameters: { resultId: 'USPTO-123' } })))?.result });
    const rendered = await new PdfRenderer({ maxPages: 10, maxResults: 5 }).render({ exportId, generatedAt: new Date(createdAt), documentModel: document });
    assert.equal(rendered.contentType, 'application/pdf'); assert.match(rendered.body.toString('binary'), /Research assistance only/); assert.match(rendered.body.toString('binary'), /Page 1 of/); assert.equal(rendered.body.toString('binary').includes('<script>'), false);
  });

  it('prevents storage traversal and records byte size/checksum through private in-memory storage', async () => {
    const storage = new InMemoryPdfStorage({ maxBytes: 1024 * 1024 }); const key = exportStorageKey({ firmId, exportId });
    const saved = await storage.put({ key, contentType: 'application/pdf', body: Buffer.from('%PDF-safe') });
    assert.equal(saved.byteSize, 9); assert.match(saved.checksumSha256, /^[a-f0-9]{64}$/); assert.deepEqual(await storage.get({ key }), Buffer.from('%PDF-safe'));
    assert.throws(() => validateExportStorageKey('../secrets.pdf'));
  });

  it('validates versioned jobs and completes an export once without duplicate rendering', async () => {
    const repo = repository({ initial: [exportRecord()] }); const jobs = queue(); const events = audit(); const storage = new InMemoryPdfStorage(); let renders = 0;
    const processor = new PdfExportProcessor({
      repository: repo, queue: jobs, sourceLoader: { async load() { return { kind: 'search_results', sourceAttribution: 'Stored', searchId: sourceEntityId, requestId: 'r', query: {}, results: [], sourceStatuses: [], partial: false, methodologyVersions: [], createdAt }; } },
      renderer: { async render() { renders += 1; return { body: Buffer.from('%PDF-1.4'), contentType: 'application/pdf' }; } }, storage, exportAuditService: events,
      exportService: { async markFailed() { throw new Error('unexpected'); } }, clock: () => new Date(createdAt), maxAttempts: 3,
    });
    const job = { version: 1, exportId, firmId, scheduledFor: createdAt, attempt: 0, jobId: deterministicPdfExportJobId(exportId, createdAt, 0) };
    assert.deepEqual(validatePdfExportJob(job, 3), job);
    assert.equal((await processor.process(job)).outcome, 'completed'); assert.equal((await processor.process(job)).outcome, 'skipped'); assert.equal(renders, 1);
    assert.equal(repo.state.records[0].status, 'completed'); assert.equal(events.calls[0][0], 'completed'); assert.equal(Object.hasOwn(events.calls[0][1], 'storageKey'), false);
    assert.equal(events.calls[0][1].byteSize, 8); assert.match(events.calls[0][1].checksumSha256, /^[a-f0-9]{64}$/);
  });

  it('rolls lifecycle state back and removes an uploaded object when completion auditing fails', async () => {
    const repo = repository({ initial: [exportRecord()] }); const jobs = queue(); const storage = new InMemoryPdfStorage(); const events = audit({ fail: true });
    const processor = new PdfExportProcessor({
      repository: repo, queue: jobs, sourceLoader: { async load() { return { kind: 'search_results', sourceAttribution: 'Stored', searchId: sourceEntityId, requestId: 'r', query: {}, results: [], sourceStatuses: [], partial: false, methodologyVersions: [], createdAt }; } },
      renderer: { async render() { return { body: Buffer.from('%PDF-1.4'), contentType: 'application/pdf' }; } }, storage, exportAuditService: events,
      exportService: { async markFailed() { return { id: exportId }; } }, clock: () => new Date(createdAt), maxAttempts: 1,
    });
    const job = { version: 1, exportId, firmId, scheduledFor: createdAt, attempt: 0, jobId: deterministicPdfExportJobId(exportId, createdAt, 0) };
    const outcome = await processor.process(job);
    assert.equal(outcome.code, 'EXPORT_AUDIT_WRITE_FAILED'); assert.equal(repo.state.records[0].status, 'processing');
    assert.equal(await storage.get({ key: exportStorageKey({ firmId, exportId }) }), null);
  });

  it('retries bounded infrastructure failures but terminally fails missing source data', async () => {
    const makeProcessor = ({ sourceError }) => {
      const repo = repository({ initial: [exportRecord()] }); const jobs = queue();
      const processor = new PdfExportProcessor({
        repository: repo, queue: jobs, sourceLoader: { async load() { throw sourceError; } }, renderer: { async render() { throw new Error('not called'); } },
        storage: new InMemoryPdfStorage(), exportAuditService: audit(), exportService: { async markFailed() { return { id: exportId }; } }, clock: () => new Date(createdAt), maxAttempts: 3,
      });
      return { repo, jobs, processor };
    };
    const retrying = makeProcessor({ sourceError: new Error('temporary') });
    const job = { version: 1, exportId, firmId, scheduledFor: createdAt, attempt: 0, jobId: deterministicPdfExportJobId(exportId, createdAt, 0) };
    assert.equal((await retrying.processor.process(job)).outcome, 'retrying');
    assert.equal(retrying.repo.state.records[0].status, 'queued'); assert.equal(retrying.jobs.jobs[0].attempt, 1);
    const terminal = makeProcessor({ sourceError: new AppError(404, 'EXPORT_SOURCE_NOT_FOUND', 'missing') });
    assert.equal((await terminal.processor.process(job)).code, 'EXPORT_SOURCE_NOT_FOUND');
    assert.equal(terminal.jobs.jobs.length, 0);
  });
});

describe('Export HTTP policy', () => {
  it('requires auth, keeps viewers out, uses membership firm context, and does not expose storage keys', async () => {
    const calls = []; const identities = { admin: { userId: actorUserId, firmId, role: 'admin' }, attorney: { userId: actorUserId, firmId, role: 'attorney' }, viewer: { userId: actorUserId, firmId, role: 'viewer' }, other: { userId: actorUserId, firmId: otherFirmId, role: 'admin' } };
    const authenticate = (req, _res, next) => { const identity = identities[req.get('authorization')]; if (!identity) return next(unauthorized()); req.auth = identity; req.auditContext = { requestId: 'request-1' }; return next(); };
    const app = express(); app.use(express.json()); app.use('/api/v1', createExportRouter(authenticate, {
      async createExport(payload) { calls.push(payload); return { created: true, export: { id: exportId, status: 'queued' } }; },
      async listExports() { return { exports: [], nextCursor: null }; }, async getExport({ firmId: scoped }) { if (scoped !== firmId) throw new AppError(404, 'EXPORT_NOT_FOUND', 'Export not found.'); return { id: exportId, status: 'completed' }; },
      async download({ firmId: scoped }) { if (scoped !== firmId) throw new AppError(404, 'EXPORT_NOT_FOUND', 'Export not found.'); return { id: exportId, mimeType: 'application/pdf', body: Buffer.from('%PDF') }; },
    })); app.use(errorHandler);
    assert.equal((await request(app).post('/api/v1/exports').send(input())).status, 401);
    assert.equal((await request(app).post('/api/v1/exports').set('Authorization', 'viewer').send(input())).status, 403);
    assert.equal((await request(app).post('/api/v1/exports').set('Authorization', 'attorney').send(input())).status, 202);
    assert.equal(calls[0].firmId, firmId); assert.equal(Object.hasOwn(calls[0].input, 'firmId'), false);
    const download = await request(app).get(`/api/v1/exports/${exportId}/download`).set('Authorization', 'admin');
    assert.equal(download.status, 200); assert.equal(download.headers['content-type'].startsWith('application/pdf'), true); assert.equal(Buffer.from(download.body).toString('utf8').includes('storageKey'), false);
    assert.equal((await request(app).get(`/api/v1/exports/${exportId}`).set('Authorization', 'other')).status, 404);
  });

  it('leaves export paths behind the feature gate when no export service is supplied', async () => {
    const authenticate = (_req, _res, next) => next(unauthorized());
    const app = createApp({
      authenticate, authenticateIdentity: authenticate,
      authService: { async invitationDetails() {}, async acceptInvitation() {}, async issueInvitation() {} },
      provisioningService: { async provisionFirm() {} },
    });
    assert.equal((await request(app).get('/api/v1/exports')).status, 404);
  });
});
