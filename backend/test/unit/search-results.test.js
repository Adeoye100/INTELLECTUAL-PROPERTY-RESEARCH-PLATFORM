import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { AppError, errorHandler, unauthorized } from '../../src/errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../src/audit/audit-taxonomy.js';
import { SearchResultRepository } from '../../src/search/search-result-repository.js';
import { SearchResultService } from '../../src/search/search-result-service.js';
import { parseSearchResultListQuery } from '../../src/search/search-result-validation.js';
import { createSearchResultRouter } from '../../src/routes/search-result-routes.js';
import { createSearchRouter } from '../../src/routes/search-routes.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const otherActorUserId = '44444444-4444-4444-8444-444444444444';
const storedUserId = '55555555-5555-4555-8555-555555555555';
const searchId = '66666666-6666-4666-8666-666666666666';
const otherSearchId = '77777777-7777-4777-8777-777777777777';

const query = Object.freeze({
  mark: 'FORGE', jurisdictions: ['US'], niceClasses: [9, 42], status: 'registered', owner: null,
  filedFrom: null, filedTo: null,
});

function rawSearchResponse(overrides = {}) {
  const hit = {
    recordId: 'elasticsearch-internal-id', markText: 'FORGE GLOBAL', sourceRegistry: 'USPTO',
    sourceReferenceId: 'US-123456', owner: null, jurisdiction: 'US', niceClasses: [9, 42],
    filingDate: null, status: 'registered', relevanceScore: 99,
    riskAnalysis: {
      candidateRecordId: 'elasticsearch-internal-id', candidateSource: 'USPTO', candidateRef: 'US-123456',
      phoneticScore: 88, visualScore: 91, conceptualScore: null, classOverlap: true,
      classOverlapScore: 100, compositeScore: 92, compositeRating: 'high',
      methodology: {
        version: 'confusion-risk-v1.0.0-provisional', description: 'Synthetic historical research signal.',
        sourceAttribution: ['USPTO'],
      },
      matchedMarkRefs: [
        { type: 'Visual', evidence: 'Synthetic visual evidence.', score: 91 },
        { type: 'Phonetic', evidence: 'Synthetic phonetic evidence.', score: 88 },
        { type: 'Class', evidence: 'Synthetic class overlap evidence.', score: 100 },
      ],
    },
  };
  return {
    requestId: 'request-1', partial: false,
    sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 1 }],
    results: [hit],
    ...overrides,
  };
}

function snapshotRepository({ initial = [] } = {}) {
  const state = { snapshots: structuredClone(initial), audits: [], committed: 0, rolledBack: 0, calls: [] };
  const findByRequest = (firm, requestId) => state.snapshots.find((entry) => entry.firmId === firm && entry.requestId === requestId) ?? null;
  return {
    state,
    async withTransaction(work) {
      const before = structuredClone(state.snapshots);
      try {
        const result = await work({ async query() {} });
        state.committed += 1;
        return result;
      } catch (error) {
        state.snapshots = before;
        state.rolledBack += 1;
        throw error;
      }
    },
    async insertSnapshot(payload) {
      state.calls.push(['insert', payload]);
      if (findByRequest(payload.snapshot.firmId, payload.snapshot.requestId)) return null;
      const stored = {
        ...structuredClone(payload.snapshot), requestedByUserId: storedUserId,
        requestedByActorUserId: payload.actorUserId,
      };
      state.snapshots.push(stored);
      return structuredClone(stored);
    },
    async findByRequestIdForFirm({ firmId: scopedFirmId, requestId }) {
      const found = findByRequest(scopedFirmId, requestId);
      return found ? structuredClone(found) : null;
    },
    async findByIdForFirm({ firmId: scopedFirmId, id }) {
      const found = state.snapshots.find((entry) => entry.firmId === scopedFirmId && entry.id === id);
      return found ? structuredClone(found) : null;
    },
    async listForFirm({ firmId: scopedFirmId, actorUserId: scopedActorId, filters, pagination }) {
      return state.snapshots
        .filter((entry) => entry.firmId === scopedFirmId)
        .filter((entry) => !scopedActorId || entry.requestedByActorUserId === scopedActorId)
        .filter((entry) => !filters.requestedByUserId || entry.requestedByUserId === filters.requestedByUserId)
        .filter((entry) => !filters.createdFrom || entry.createdAt >= filters.createdFrom)
        .filter((entry) => !filters.createdTo || entry.createdAt <= filters.createdTo)
        .filter((entry) => filters.partial === null || entry.partial === filters.partial)
        .filter((entry) => !pagination.cursor || entry.createdAt < pagination.cursor.createdAt
          || (entry.createdAt === pagination.cursor.createdAt && entry.id < pagination.cursor.id))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
        .slice(0, pagination.pageSize + 1)
        .map((entry) => structuredClone(entry));
    },
  };
}

function audit({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async record(payload) {
      calls.push(payload);
      if (fail) throw new Error('audit write failed');
      return { id: searchId };
    },
  };
}

function service(options = {}) {
  const repository = options.repository ?? snapshotRepository();
  const recorded = options.auditService ?? audit();
  return {
    repository,
    recorded,
    service: new SearchResultService({
      repository,
      auditService: recorded,
      clock: options.clock ?? (() => new Date('2026-08-22T00:00:00.000Z')),
      idGenerator: options.idGenerator ?? (() => searchId),
    }),
  };
}

describe('search_results snapshot schema and validation', () => {
  it('defines required immutable tenant-scoped schema and BE-16 taxonomy extension', async () => {
    const migration = await readFile(new URL('../../migrations/011_create_search_results.sql', import.meta.url), 'utf8');
    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS search_results', 'firm_id uuid NOT NULL REFERENCES firms(id)',
      'requested_by_user_id uuid NOT NULL REFERENCES users(id)', 'request_id varchar(128) NOT NULL',
      'query_snapshot jsonb NOT NULL', 'results_snapshot jsonb NOT NULL', 'source_statuses jsonb NOT NULL',
      'methodology_versions jsonb NOT NULL', 'search_results_firm_request_id_key',
      'search_results_firm_created_id_idx', 'search_results_firm_requester_created_id_idx',
      'reject_search_results_mutation', 'BEFORE UPDATE OR DELETE ON search_results',
      'search.executed', 'search_result',
    ]) assert.match(migration, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(AUDIT_ACTIONS.SEARCH_EXECUTED, 'search.executed');
    assert.equal(AUDIT_ENTITY_TYPES.SEARCH_RESULT, 'search_result');
    assert.equal(SearchResultRepository.prototype.update, undefined);
    assert.equal(SearchResultRepository.prototype.delete, undefined);
  });

  it('validates bounded, non-mutating snapshots and rejects invalid provenance, evidence, circular values, and size', async () => {
    const { service: snapshots } = service();
    const originalQuery = structuredClone(query);
    const originalResponse = structuredClone(rawSearchResponse());
    const saved = await snapshots.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: rawSearchResponse() });
    assert.equal(saved.response.searchId, searchId);
    assert.deepEqual(query, originalQuery);
    assert.deepEqual(rawSearchResponse(), originalResponse);
    for (const response of [
      rawSearchResponse({ results: [{ ...rawSearchResponse().results[0], sourceReferenceId: '' }] }),
      rawSearchResponse({ results: [{ ...rawSearchResponse().results[0], riskAnalysis: { ...rawSearchResponse().results[0].riskAnalysis, matchedMarkRefs: [] } }] }),
      rawSearchResponse({ sourceStatuses: (() => { const status = { source: 'USPTO', status: 'complete', resultCount: 1 }; status.self = status; return [status]; })() }),
      rawSearchResponse({ sourceStatuses: [JSON.parse('{"source":"USPTO","status":"complete","resultCount":1,"__proto__":"blocked"}')] }),
      rawSearchResponse({ results: [{ ...rawSearchResponse().results[0], riskAnalysis: { ...rawSearchResponse().results[0].riskAnalysis, visualScore: Number.NaN } }] }),
    ]) await assert.rejects(
      () => service().service.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: response }),
      (error) => ['SEARCH_SNAPSHOT_PROVENANCE_INVALID', 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'SEARCH_SNAPSHOT_INVALID'].includes(error.code),
    );
    const oversized = rawSearchResponse({
      results: Array.from({ length: 100 }, (_, index) => {
        const hit = structuredClone(rawSearchResponse().results[0]);
        hit.recordId = `id-${index}`;
        hit.sourceReferenceId = `US-${index}`;
        hit.markText = 'M'.repeat(500);
        hit.riskAnalysis.candidateRecordId = hit.recordId;
        hit.riskAnalysis.candidateRef = hit.sourceReferenceId;
        hit.riskAnalysis.methodology.description = 'D'.repeat(1_000);
        hit.riskAnalysis.matchedMarkRefs.forEach((entry) => { entry.evidence = 'E'.repeat(1_000); });
        return hit;
      }),
      sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 100 }],
    });
    await assert.rejects(
      () => service().service.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: oversized }),
      { code: 'SEARCH_SNAPSHOT_TOO_LARGE' },
    );
  });

  it('validates bounded deterministic cursor and filter input', () => {
    assert.deepEqual(parseSearchResultListQuery({ partial: 'true', pageSize: '2' }), {
      filters: { requestedByUserId: null, createdFrom: null, createdTo: null, partial: true },
      pagination: { pageSize: 2, cursor: null },
    });
    for (const value of [{ pageSize: '101' }, { partial: 'sometimes' }, { cursor: 'not-a-cursor' }, { createdFrom: 'invalid' }]) {
      assert.throws(() => parseSearchResultListQuery(value));
    }
  });
});

describe('SearchResultService persistence, auditing, and history', () => {
  it('persists complete, zero-result, and valid partial snapshots with one stable ID and safe audit summary', async () => {
    const { service: snapshots, recorded, repository } = service();
    const complete = await snapshots.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: rawSearchResponse() });
    assert.equal(complete.response.searchId, searchId);
    assert.equal(complete.response.results[0].searchId, searchId);
    assert.equal(complete.response.results[0].candidateRef, 'US-123456');
    assert.equal(Object.hasOwn(complete.response.results[0], 'relevanceScore'), false);
    assert.equal(complete.response.results[0].owner, null);
    assert.equal(complete.response.results[0].filingDate, null);
    assert.equal(complete.response.results[0].riskAnalysis.conceptualScore, null);
    assert.deepEqual(recorded.calls[0].afterState, {
      searchId, resultCount: 1, partial: false, methodologyVersions: ['confusion-risk-v1.0.0-provisional'],
    });
    assert.deepEqual(recorded.calls[0].metadata, {
      respondingSources: ['USPTO'], unavailableSources: [], jurisdictionCount: 1, niceClassCount: 2,
    });
    assert.equal(recorded.calls[0].transaction !== null, true);
    assert.equal(recorded.calls[0].action, AUDIT_ACTIONS.SEARCH_EXECUTED);
    assert.equal(recorded.calls[0].entityType, AUDIT_ENTITY_TYPES.SEARCH_RESULT);

    const zero = service({ idGenerator: () => otherSearchId });
    const zeroSaved = await zero.service.persistSearch({
      firmId, requestedByUserId: actorUserId, query,
      searchResponse: rawSearchResponse({ requestId: 'request-zero', results: [], sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 0 }] }),
    });
    assert.equal(zeroSaved.response.searchId, otherSearchId);
    assert.deepEqual(zeroSaved.response.results, []);

    const partial = service({ idGenerator: () => otherSearchId });
    const partialSaved = await partial.service.persistSearch({
      firmId, requestedByUserId: actorUserId, query,
      searchResponse: rawSearchResponse({ requestId: 'request-partial', partial: true, sourceStatuses: [
        { source: 'USPTO', status: 'complete', resultCount: 1 }, { source: 'EUIPO', status: 'unavailable', resultCount: 0 },
      ] }),
    });
    assert.equal(partialSaved.response.partial, true);
    assert.equal(repository.state.snapshots.length, 1);
  });

  it('handles equivalent retries idempotently, rejects conflicts, and rolls snapshots back on audit failure', async () => {
    const shared = service();
    const first = await shared.service.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: rawSearchResponse() });
    const retry = await shared.service.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: rawSearchResponse() });
    assert.equal(first.persisted, true);
    assert.equal(retry.persisted, false);
    assert.equal(shared.repository.state.snapshots.length, 1);
    assert.equal(shared.recorded.calls.length, 1);
    await assert.rejects(
      () => shared.service.persistSearch({
        firmId, requestedByUserId: actorUserId, query,
        searchResponse: rawSearchResponse({ results: [{ ...rawSearchResponse().results[0], markText: 'CHANGED' }] }),
      }),
      { code: 'SEARCH_SNAPSHOT_CONFLICT' },
    );
    const failing = service({ auditService: audit({ fail: true }) });
    await assert.rejects(
      () => failing.service.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: rawSearchResponse() }),
      { code: 'SEARCH_SNAPSHOT_WRITE_FAILED' },
    );
    assert.equal(failing.repository.state.snapshots.length, 0);
    assert.equal(failing.repository.state.rolledBack, 1);
  });

  it('returns exact historical evidence without search/risk work and firm-scopes retrieval, lists, and export loading', async () => {
    const shared = service();
    await shared.service.persistSearch({ firmId, requestedByUserId: actorUserId, query, searchResponse: rawSearchResponse() });
    const historical = await shared.service.getSearchResult({ firmId, searchResultId: searchId });
    assert.equal(historical.results[0].riskAnalysis.methodology.version, 'confusion-risk-v1.0.0-provisional');
    assert.equal(historical.results[0].riskAnalysis.compositeScore, 92);
    assert.equal(historical.results[0].searchId, searchId);
    assert.equal(await shared.service.loadSearchSnapshotForExport({ firmId, actorUserId, searchResultId: searchId }).then((snapshot) => snapshot.id), searchId);
    await assert.rejects(
      () => shared.service.getSearchResult({ firmId: otherFirmId, searchResultId: searchId }),
      { code: 'SEARCH_RESULT_NOT_FOUND' },
    );
    const page = await shared.service.listSearchResults({
      firmId, actorUserId, role: 'viewer', filters: { requestedByUserId: null, createdFrom: null, createdTo: null, partial: null },
      pagination: { pageSize: 25, cursor: null },
    });
    assert.equal(page.searchResults.length, 1);
    assert.equal(Object.hasOwn(page.searchResults[0], 'results'), false);
    const otherActor = await shared.service.listSearchResults({
      firmId, actorUserId: otherActorUserId, role: 'attorney', filters: { requestedByUserId: null, createdFrom: null, createdTo: null, partial: null },
      pagination: { pageSize: 25, cursor: null },
    });
    assert.deepEqual(otherActor.searchResults, []);
  });
});

describe('Search results repository and HTTP routes', () => {
  it('uses parameterized firm-scoped insert/read SQL with deterministic cursor ordering', async () => {
    const calls = [];
    const row = {
      id: searchId, firm_id: firmId, requested_by_user_id: storedUserId, request_id: 'request-1', query_snapshot: query,
      results_snapshot: [], source_statuses: [], partial: false, result_count: 0, methodology_versions: [], created_at: new Date(),
      requested_by_actor_user_id: actorUserId,
    };
    const client = { async query(sql, values = []) { calls.push([sql, values]); return { rowCount: 1, rows: [row] }; }, release() {} };
    const database = { async query(sql, values = []) { calls.push([sql, values]); return { rowCount: 1, rows: [row] }; }, async connect() { return client; } };
    const repository = new SearchResultRepository(database);
    await repository.withTransaction(async (transaction) => repository.insertSnapshot({
      transaction,
      actorUserId,
      snapshot: {
        id: searchId, firmId, requestedByUserId: actorUserId, requestId: 'request-1', querySnapshot: query,
        resultsSnapshot: [], sourceStatuses: [], partial: false, resultCount: 0, methodologyVersions: [], createdAt: '2026-08-22T00:00:00.000Z',
      },
    }));
    await repository.findByIdForFirm({ firmId, id: searchId });
    await repository.findByRequestIdForFirm({ firmId, requestId: 'request-1' });
    await repository.listForFirm({
      firmId, actorUserId, filters: { requestedByUserId: null, createdFrom: null, createdTo: null, partial: null },
      pagination: { pageSize: 10, cursor: { createdAt: '2026-08-22T00:00:00.000Z', id: searchId } },
    });
    const sql = calls.map(([statement]) => statement).join('\n');
    assert.match(sql, /ON CONFLICT \(firm_id, request_id\) DO NOTHING/);
    assert.match(sql, /WHERE firm_id = \$1 AND id = \$2/);
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    assert.equal(/UPDATE search_results|DELETE FROM search_results/.test(sql), false);
    assert.equal(sql.includes(firmId), false);
  });

  it('enforces authentication/RBAC, UUID validation, and firm-scoped result routes with no mutation paths', async () => {
    const calls = [];
    const identities = {
      admin: { userId: actorUserId, firmId, role: 'admin' },
      attorney: { userId: actorUserId, firmId, role: 'attorney' },
      viewer: { userId: actorUserId, firmId, role: 'viewer' },
    };
    const authenticate = (req, _res, next) => {
      const identity = identities[req.get('authorization')?.replace('Bearer ', '')];
      if (!identity) return next(unauthorized());
      req.auth = identity;
      return next();
    };
    const app = express();
    app.use('/api/v1', createSearchResultRouter(authenticate, {
      async getSearchResult(payload) { calls.push(['get', payload]); return { id: searchId, results: [] }; },
      async listSearchResults(payload) { calls.push(['list', payload]); return { searchResults: [], nextCursor: null }; },
    }));
    app.use(errorHandler);
    assert.equal((await request(app).get(`/api/v1/search-results/${searchId}`)).status, 401);
    for (const token of ['admin', 'attorney', 'viewer']) {
      assert.equal((await request(app).get(`/api/v1/search-results/${searchId}`).set('Authorization', token)).status, 200);
      assert.equal((await request(app).get('/api/v1/search-results').set('Authorization', token)).status, 200);
    }
    assert.equal((await request(app).get('/api/v1/search-results/not-a-uuid').set('Authorization', 'admin')).status, 400);
    assert.equal((await request(app).post('/api/v1/search-results').set('Authorization', 'admin')).status, 404);
    assert.equal(calls.every(([, payload]) => payload.firmId === firmId), true);
  });

  it('persists through the authenticated execution route before returning its durable searchId', async () => {
    const persisted = service();
    const authenticate = (req, _res, next) => {
      if (req.get('authorization') !== 'Bearer token') return next(unauthorized());
      req.auth = { userId: actorUserId, firmId, role: 'viewer' };
      req.auditContext = { requestId: 'request-1', ipAddress: null, userAgent: null };
      return next();
    };
    const app = express();
    app.use('/api/v1', createSearchRouter(authenticate, {
      async search() { return rawSearchResponse(); },
    }, { searchResultService: persisted.service }));
    app.use(errorHandler);
    const response = await request(app).get('/api/v1/search?mark=FORGE').set('Authorization', 'Bearer token');
    assert.equal(response.status, 200);
    assert.equal(response.body.searchId, searchId);
    assert.equal(response.body.results[0].searchId, searchId);
    assert.equal(persisted.repository.state.snapshots.length, 1);
    assert.equal(persisted.recorded.calls.length, 1);
  });
});
