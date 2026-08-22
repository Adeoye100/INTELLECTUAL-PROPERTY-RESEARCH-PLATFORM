import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { errorHandler, unauthorized } from '../../src/errors.js';
import { FederatedOfficeActionSearchService } from '../../src/office-actions/federated-office-action-search-service.js';
import { createOfficeActionSearchRuntime } from '../../src/office-actions/office-action-search-runtime.js';
import { parseOfficeActionSearchQuery } from '../../src/office-actions/office-action-validation.js';
import { createOfficeActionSearchRouter } from '../../src/routes/office-action-routes.js';

const sourceRecord = Object.freeze({
  sourceRegistry: 'USPTO', sourceReferenceId: 'US-123', applicationNumber: '88/123456',
  markText: 'FORGE', owner: null, jurisdiction: 'US', documentType: 'non_final_office_action',
  officeActionDate: '2026-08-01', examinerName: null, examinerReasoningSummary: null,
  summaryMethod: 'registry', sourceDocumentUrl: 'https://registry.example.test/documents/US-123',
  sourceMetadata: { documentTitle: 'Non-final Office Action', rawDocument: 'never expose' },
});

function source(name, records = [sourceRecord]) {
  return { sourceName: name, async searchOfficeActions() { return records; } };
}

function service(sources, overrides = {}) {
  return new FederatedOfficeActionSearchService({
    sources, sourceTimeoutMs: 100, requestIdFactory: () => 'office-action-request-1', ...overrides,
  });
}

function searchApp(searchService, calls = []) {
  const identities = {
    'admin-token': { userId: '11111111-1111-4111-8111-111111111111', firmId: '22222222-2222-4222-8222-222222222222', role: 'admin' },
    'attorney-token': { userId: '11111111-1111-4111-8111-111111111111', firmId: '22222222-2222-4222-8222-222222222222', role: 'attorney' },
    'viewer-token': { userId: '11111111-1111-4111-8111-111111111111', firmId: '22222222-2222-4222-8222-222222222222', role: 'viewer' },
  };
  const authenticate = (req, _res, next) => {
    const identity = identities[req.get('authorization')?.replace('Bearer ', '')];
    if (!identity) return next(unauthorized());
    req.auth = identity;
    return next();
  };
  const wrapped = { async searchOfficeActions(query) { calls.push(query); return searchService.searchOfficeActions(query); } };
  const app = express();
  app.use('/api/v1', createOfficeActionSearchRouter(authenticate, wrapped, { maximumResults: 25 }));
  app.use(errorHandler);
  return app;
}

describe('Office Action query and federated search', () => {
  it('normalizes bounded queries and requires a meaningful criterion', () => {
    assert.deepEqual(parseOfficeActionSearchQuery({
      applicationNumber: ' 88/123456 ', markText: ' Forge ', owner: ' Acme ', filedFrom: '2025-01-01',
      filedTo: '2026-01-01', documentType: ['final_office_action', 'final_office_action'],
      jurisdiction: ['us', 'US'], maxResults: '3',
    }), {
      applicationNumber: '88/123456', markText: 'Forge', owner: 'Acme', filedFrom: '2025-01-01', filedTo: '2026-01-01',
      documentTypes: ['final_office_action'], jurisdictions: ['US'], maxResults: 3,
    });
    for (const query of [
      {}, { documentType: 'invented' }, { jurisdiction: 'US!' }, { filedFrom: '2026-02-30' },
      { filedFrom: '2026-02-02', filedTo: '2026-02-01' }, { maxResults: '26', markText: 'Forge' },
      { firmId: '11111111-1111-4111-8111-111111111111', markText: 'Forge' },
    ]) assert.throws(() => parseOfficeActionSearchQuery(query), { code: 'VALIDATION_ERROR' });
  });

  it('fans out concurrently, preserves source order, isolates failures, and deduplicates only provenance', async () => {
    const started = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const concurrent = service(['USPTO', 'EUIPO'].map((sourceName) => ({
      sourceName,
      async searchOfficeActions() { started.push(sourceName); await gate; return []; },
    })));
    const pending = concurrent.searchOfficeActions({ markText: 'FORGE' });
    await Promise.resolve();
    assert.deepEqual(started, ['USPTO', 'EUIPO']);
    release();
    await pending;

    const alternate = { ...sourceRecord, sourceReferenceId: 'US-124', markText: 'FORGE', sourceMetadata: {} };
    const result = await service([
      source('USPTO', [sourceRecord, sourceRecord, alternate]),
      { sourceName: 'EUIPO', async searchOfficeActions() { throw new Error('token must not leak'); } },
    ]).searchOfficeActions({ markText: 'FORGE' });
    assert.deepEqual(result.results.map((record) => record.sourceReferenceId), ['US-123', 'US-124']);
    assert.deepEqual(result.sourceStatuses, [
      { source: 'USPTO', status: 'complete', resultCount: 2 },
      { source: 'EUIPO', status: 'unavailable', resultCount: 0 },
    ]);
    assert.equal(result.partial, true);
    assert.equal(result.results[0].owner, null);
    assert.deepEqual(result.results[0].sourceMetadata, { documentTitle: 'Non-final Office Action' });
    assert.equal(Object.hasOwn(result.results[0], 'rawDocument'), false);
  });

  it('isolates timeouts and malformed source output without fabricating summaries or provenance', async () => {
    const result = await service([
      { sourceName: 'USPTO', async searchOfficeActions() { return [{ ...sourceRecord, sourceReferenceId: '' }]; } },
      { sourceName: 'EUIPO', async searchOfficeActions() { return new Promise(() => {}); } },
    ]).searchOfficeActions({ markText: 'FORGE' });
    assert.deepEqual(result.results, []);
    assert.equal(result.partial, true);
    assert.deepEqual(result.sourceStatuses.map((status) => status.status), ['unavailable', 'unavailable']);
  });

  it('constructs only injected configured sources and performs no source call at runtime construction', () => {
    let calls = 0;
    const runtime = createOfficeActionSearchRuntime({
      officeActionSearchEnabled: true, officeActionSourceRegistries: ['USPTO'],
      officeActionSourceTimeoutMs: 1_000, officeActionSearchMaxResults: 25,
    }, { sources: [{ sourceName: 'USPTO', async searchOfficeActions() { calls += 1; return []; } }] });
    assert.equal(calls, 0);
    assert.equal(runtime.officeActionSources.length, 1);
    assert.ok(runtime.officeActionSearchService instanceof FederatedOfficeActionSearchService);
    assert.deepEqual(createOfficeActionSearchRuntime({ officeActionSearchEnabled: false }), {
      officeActionSources: [], federatedOfficeActionSearchService: null, officeActionSearchService: null,
    });
  });
});

describe('Office Action search route', () => {
  it('requires authentication, permits all three roles, validates before search, and allow-lists output', async () => {
    const calls = [];
    const app = searchApp(service([source('USPTO')]), calls);
    assert.equal((await request(app).get('/api/v1/office-actions/search?markText=FORGE')).status, 401);
    for (const token of ['admin-token', 'attorney-token', 'viewer-token']) {
      const response = await request(app).get('/api/v1/office-actions/search?markText=FORGE').set('Authorization', `Bearer ${token}`);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.results[0].sourceMetadata, { documentTitle: 'Non-final Office Action' });
      assert.equal(JSON.stringify(response.body).includes('rawDocument'), false);
    }
    const before = calls.length;
    const invalid = await request(app).get('/api/v1/office-actions/search?firmId=x&markText=FORGE').set('Authorization', 'Bearer admin-token');
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, before);
  });

  it('is absent when no Office Action search service is injected into the feature-gated application', async () => {
    const authenticate = (_req, _res, next) => next();
    const app = createApp({
      authenticate, authenticateIdentity: authenticate,
      authService: { async invitationDetails() {}, async acceptInvitation() {}, async issueInvitation() {} },
      provisioningService: { async provisionFirm() {} },
    });
    const response = await request(app).get('/api/v1/office-actions/search?markText=FORGE');
    assert.equal(response.status, 404);
    assert.equal(response.body.code, 'NOT_FOUND');
  });

  it('mounts an enabled injected Office Action search service before the application 404 handler', async () => {
    const authenticate = (req, _res, next) => {
      req.auth = { userId: '11111111-1111-4111-8111-111111111111', firmId: '22222222-2222-4222-8222-222222222222', role: 'viewer' };
      next();
    };
    const app = createApp({
      authenticate, authenticateIdentity: authenticate,
      authService: { async invitationDetails() {}, async acceptInvitation() {}, async issueInvitation() {} },
      provisioningService: { async provisionFirm() {} },
      officeActionSearchService: service([source('USPTO')]), officeActionSearchMaxResults: 25,
    });
    const response = await request(app).get('/api/v1/office-actions/search?markText=FORGE');
    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].sourceReferenceId, 'US-123');
  });
});
