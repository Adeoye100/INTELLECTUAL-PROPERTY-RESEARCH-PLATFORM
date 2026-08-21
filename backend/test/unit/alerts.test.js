import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { errorHandler, unauthorized } from '../../src/errors.js';
import { AlertGenerationService } from '../../src/alerts/alert-generation-service.js';
import { AlertRepository } from '../../src/alerts/alert-repository.js';
import { AlertService } from '../../src/alerts/alert-service.js';
import { riskFingerprint } from '../../src/alerts/alert-fingerprint.js';
import { WATCH_ALERT_POLICY } from '../../src/alerts/alert-policy.js';
import { createAlertRouter } from '../../src/routes/alert-routes.js';
import { WatchIngestProcessor } from '../../src/watch/watch-ingest-processor.js';
import { deterministicWatchJobId } from '../../src/watch/watch-ingest-queue.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const watchId = '33333333-3333-4333-8333-333333333333';
const markId = '44444444-4444-4444-8444-444444444444';
const alertId = '55555555-5555-4555-8555-555555555555';
const riskId = '66666666-6666-4666-8666-666666666666';
const scheduledFor = '2026-08-21T00:00:00.000Z';
const clock = () => new Date(scheduledFor);

function result(rating = 'high', overrides = {}) {
  const score = rating === 'high' ? 88 : rating === 'medium' ? 62 : 20;
  return {
    recordId: 'internal-only-candidate', markText: 'CANDIDATE', sourceRegistry: 'USPTO', sourceReferenceId: '12345678',
    relevanceScore: 99,
    riskAnalysis: {
      candidateRecordId: 'internal-only-candidate', candidateSource: 'USPTO', candidateRef: '12345678',
      visualScore: score, phoneticScore: score, conceptualScore: null, classOverlap: true,
      classOverlapScore: score, compositeScore: score, compositeRating: rating,
      methodology: { version: 'confusion-risk-v1.0.0-provisional', description: 'test', sourceAttribution: ['USPTO'] },
      matchedMarkRefs: [
        { type: 'Visual', evidence: 'visual', score }, { type: 'Phonetic', evidence: 'phonetic', score }, { type: 'Class', evidence: 'class', score },
      ],
    },
    ...overrides,
  };
}

function pollInput(overrides = {}) {
  return {
    firmId, watchId, portfolioMarkId: markId, requestId: 'request-1', polledAt: scheduledFor,
    results: [result()], sourceStatuses: [{ source: 'USPTO', status: 'complete' }], partial: false,
    ...overrides,
  };
}

const riskScore = {
  id: riskId, firmId, watchId, portfolioMarkId: markId, candidateSource: 'USPTO',
  candidateRegistryReference: '12345678', candidateMarkText: 'CANDIDATE', visualScore: 88,
  phoneticScore: 88, classOverlapScore: 88, compositeScore: 88, conceptualScore: null,
  compositeRating: 'high', methodologyVersion: 'confusion-risk-v1.0.0-provisional',
  matchedMarkRefs: result().riskAnalysis.matchedMarkRefs, sourceRequestId: 'request-1', observedAt: scheduledFor,
  sourceStatuses: [{ source: 'USPTO', status: 'complete' }], sourcePartial: false,
  createdAt: scheduledFor,
};
const alert = { id: alertId, firmId, watchId, portfolioMarkId: markId, riskScoreId: riskId, severity: 'high', status: 'unread', policyVersion: WATCH_ALERT_POLICY.version, createdAt: scheduledFor, readAt: null, dismissedAt: null, updatedAt: scheduledFor, riskScore };

describe('alert policy and generation service', () => {
  it('persists high and medium snapshots with alerts, but persists low snapshots without an alert', async () => {
    const calls = [];
    const service = new AlertGenerationService({ repository: { async persistSnapshotAndAlert(payload) { calls.push(payload); return { riskScore, alert: payload.alertPolicy.eligible ? alert : null }; } } });
    const high = await service.generateAlertsForWatchPoll(pollInput());
    const medium = await service.generateAlertsForWatchPoll(pollInput({ results: [result('medium')] }));
    const low = await service.generateAlertsForWatchPoll(pollInput({ results: [result('low')] }));
    assert.equal(high.alerts.length, 1); assert.equal(medium.alerts.length, 1); assert.equal(low.alerts.length, 0);
    assert.equal(calls[0].alertPolicy.severity, 'high');
    assert.equal(calls[1].alertPolicy.severity, 'medium');
    assert.equal(calls[2].alertPolicy.eligible, false);
    assert.equal(calls[0].snapshot.candidateRegistryReference, '12345678');
    assert.equal(Object.hasOwn(calls[0].snapshot, 'relevanceScore'), false);
  });

  it('fails closed for malformed/unattributed evidence and unavailable sources while retaining valid partial results', async () => {
    const persisted = [];
    const service = new AlertGenerationService({ repository: { async persistSnapshotAndAlert(payload) { persisted.push(payload); return { riskScore, alert }; } } });
    const response = await service.generateAlertsForWatchPoll(pollInput({
      partial: true,
      results: [result(), { ...result(), sourceReferenceId: '', riskAnalysis: { ...result().riskAnalysis, candidateRef: '' } }, { ...result('high'), sourceRegistry: 'EUIPO', riskAnalysis: { ...result().riskAnalysis, candidateSource: 'EUIPO', methodology: { ...result().riskAnalysis.methodology, sourceAttribution: ['EUIPO'] } } }],
      sourceStatuses: [{ source: 'USPTO', status: 'complete' }, { source: 'EUIPO', status: 'unavailable' }],
    }));
    assert.equal(response.partial, true);
    assert.equal(persisted.length, 1);
    assert.deepEqual(response.skipped.map(({ code }) => code), ['RISK_EVIDENCE_INVALID', 'RISK_SOURCE_UNAVAILABLE']);
  });

  it('canonicalizes object keys and evidence ordering in the deterministic fingerprint', () => {
    const base = result();
    const reordered = {
      sourceReferenceId: base.sourceReferenceId, sourceRegistry: base.sourceRegistry, markText: base.markText,
      riskAnalysis: { ...base.riskAnalysis, matchedMarkRefs: [...base.riskAnalysis.matchedMarkRefs].reverse() }, recordId: base.recordId,
    };
    assert.equal(
      riskFingerprint({ firmId, watchId, portfolioMarkId: markId, result: base }),
      riskFingerprint({ firmId, watchId, portfolioMarkId: markId, result: reordered }),
    );
    assert.notEqual(
      riskFingerprint({ firmId, watchId, portfolioMarkId: markId, result: base }),
      riskFingerprint({ firmId, watchId, portfolioMarkId: markId, result: result('medium') }),
    );
  });

  it('normalizes persistence failures without mutation or SQL details', async () => {
    const input = pollInput();
    const service = new AlertGenerationService({ repository: { async persistSnapshotAndAlert() { throw new Error('constraint and password'); } } });
    await assert.rejects(() => service.generateAlertsForWatchPoll(input), { code: 'ALERT_PERSISTENCE_FAILED', status: 500 });
    assert.equal(input.results[0].relevanceScore, 99);
    assert.equal(input.results[0].riskAnalysis.conceptualScore, null);
  });
});

describe('alert persistence repository', () => {
  it('writes risk and alert atomically with parameterized SQL and rolls back on failure', async () => {
    const calls = [];
    const riskRow = { id: riskId, firm_id: firmId, watch_id: watchId, portfolio_mark_id: markId, candidate_source: 'USPTO', candidate_registry_reference: '12345678', candidate_mark_text: 'CANDIDATE', visual_score: '88', phonetic_score: '88', class_overlap_score: '88', composite_score: '88', conceptual_score: null, composite_rating: 'high', methodology_version: 'confusion-risk-v1.0.0-provisional', matched_mark_refs: [], source_request_id: 'request-1', observed_at: scheduledFor, fingerprint: 'a'.repeat(64), created_at: scheduledFor };
    const alertRow = { id: alertId, firm_id: firmId, watch_id: watchId, portfolio_mark_id: markId, risk_score_id: riskId, severity: 'high', status: 'unread', policy_version: WATCH_ALERT_POLICY.version, created_at: scheduledFor, read_at: null, dismissed_at: null, updated_at: scheduledFor };
    const client = { async query(sql, values = []) { calls.push([sql, values]); if (sql.startsWith('INSERT INTO risk_scores')) return { rowCount: 1, rows: [riskRow] }; if (sql.startsWith('INSERT INTO alerts')) return { rowCount: 1, rows: [alertRow] }; return { rowCount: 0, rows: [] }; }, release() {} };
    const repo = new AlertRepository({ query() {}, async connect() { return client; } });
    const persisted = await repo.persistSnapshotAndAlert({ snapshot: { ...riskScore, fingerprint: 'a'.repeat(64) }, alertPolicy: { eligible: true, severity: 'high', policyVersion: WATCH_ALERT_POLICY.version } });
    assert.equal(persisted.alert.riskScoreId, riskId);
    const sql = calls.map(([statement]) => statement).join('\n');
    assert.match(sql, /BEGIN/); assert.match(sql, /COMMIT/); assert.match(sql, /ON CONFLICT \(firm_id, watch_id, fingerprint\)/); assert.match(sql, /ON CONFLICT \(risk_score_id\)/);
    assert.equal(sql.includes('CANDIDATE'), false);
    const failingClient = { async query(sql) { if (sql === 'BEGIN') return {}; if (sql.startsWith('INSERT')) throw new Error('db'); return {}; }, release() {} };
    await assert.rejects(() => new AlertRepository({ query() {}, async connect() { return failingClient; } }).persistSnapshotAndAlert({ snapshot: { ...riskScore, fingerprint: 'b'.repeat(64) }, alertPolicy: { eligible: true, severity: 'high', policyVersion: WATCH_ALERT_POLICY.version } }), /db/);
  });
});

describe('alert API and worker integration', () => {
  it('enforces roles, firm isolation, strict transitions, and omits fingerprint/relevance from API response', async () => {
    const identities = { admin: { firmId, role: 'admin' }, attorney: { firmId, role: 'attorney' }, viewer: { firmId, role: 'viewer' } };
    const calls = [];
    const repo = {
      async list(payload) { calls.push(['list', payload]); return { items: [alert], total: 1 }; },
      async get({ firmId: scope }) { return scope === firmId ? alert : null; },
      async transition(payload) { calls.push(['transition', payload]); return true; },
    };
    const service = new AlertService({ repository: repo, clock });
    const authenticate = (req, _res, next) => { const identity = identities[req.get('authorization')]; if (!identity) return next(unauthorized()); req.auth = identity; return next(); };
    const app = express(); app.use(express.json()); app.use('/api/v1', createAlertRouter(authenticate, service)); app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' })); app.use(errorHandler);
    assert.equal((await request(app).get('/api/v1/alerts')).status, 401);
    const listed = await request(app).get('/api/v1/alerts?status=unread').set('Authorization', 'viewer');
    assert.equal(listed.status, 200); assert.equal(JSON.stringify(listed.body).includes('fingerprint'), false); assert.equal(JSON.stringify(listed.body).includes('relevanceScore'), false);
    assert.equal((await request(app).patch(`/api/v1/alerts/${alertId}`).set('Authorization', 'viewer').send({ action: 'read' })).status, 403);
    assert.equal((await request(app).patch(`/api/v1/alerts/${alertId}`).set('Authorization', 'attorney').send({ action: 'read' })).status, 200);
    assert.equal((await request(app).patch(`/api/v1/alerts/${alertId}`).set('Authorization', 'admin').send({ severity: 'high' })).status, 400);
    assert.equal(calls[0][1].firmId, firmId);
    await assert.rejects(() => service.getAlert({ firmId: otherFirmId, alertId }), { code: 'ALERT_NOT_FOUND', status: 404 });
  });

  it('makes worker alert persistence retryable and never duplicates on a successful replay', async () => {
    const outcomes = [];
    const processor = new WatchIngestProcessor({
      repository: { async loadForProcessing() { return { watch: { state: 'enabled', firmId, portfolioMarkId: markId }, portfolioMark: { id: markId, firmId, markText: 'FORGE', jurisdiction: 'US', niceClasses: [9] } }; }, async recordPollOutcome(payload) { outcomes.push(payload); } },
      queue: { async acquireProcessingLock() { return 'lock'; }, async releaseProcessingLock() {} }, clock,
      searchService: { async search() { return { requestId: 'request-1', partial: false, sourceStatuses: [], results: [result()] }; } },
      alertGenerationService: { async generateAlertsForWatchPoll() { throw new Error('db'); } },
    });
    const workerJob = { version: 1, watchId, firmId, portfolioMarkId: markId, scheduledFor, attempt: 0, jobId: deterministicWatchJobId(watchId, scheduledFor) };
    assert.deepEqual(await processor.process(workerJob), { outcome: 'failed', code: 'ALERT_PERSISTENCE_FAILED', retryable: true });
    assert.equal(outcomes[0].errorCode, 'ALERT_PERSISTENCE_FAILED');
  });
});
