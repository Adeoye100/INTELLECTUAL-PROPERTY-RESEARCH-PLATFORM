import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AppError, unauthorized } from '../../src/errors.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const recordId = '44444444-4444-4444-8444-444444444444';

const portfolioInput = {
  markText: 'Phase Two Smoke', jurisdiction: 'US', sourceRegistry: 'USPTO', registryReference: 'P2-001',
  niceClasses: [9], status: 'pending', filingDate: null, registrationDate: null, renewalDate: null,
};

const watchInput = { portfolioMarkId: recordId, state: 'enabled', pollIntervalMinutes: 60 };
const officeActionInput = {
  sourceRegistry: 'USPTO', sourceReferenceId: 'OA-001', documentType: 'office_action', summaryMethod: 'manual',
};
const exportInput = { type: 'search_results', sourceEntityId: recordId, parameters: {}, idempotencyKey: 'phase2-inventory' };

function record(overrides = {}) {
  return { id: recordId, firmId, ownerUserId: userId, markText: 'PHASE TWO', ...overrides };
}

function searchResponse() {
  return {
    requestId: 'request-1', partial: false, sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 1 }],
    results: [{
      recordId, markText: 'PHASE TWO', sourceRegistry: 'USPTO', sourceReferenceId: 'P2-001', owner: null,
      jurisdiction: 'US', niceClasses: [9], filingDate: null, status: 'pending',
      riskAnalysis: {
        candidateRecordId: recordId, candidateSource: 'USPTO', candidateRef: 'P2-001',
        phoneticScore: 100, visualScore: 100, conceptualScore: null, classOverlap: true,
        classOverlapScore: 100, compositeScore: 100, compositeRating: 'high',
        methodology: { version: 'test', description: 'test', sourceAttribution: ['USPTO'] }, matchedMarkRefs: [],
      },
    }],
  };
}

function createTestApp({ calls = [] } = {}) {
  const identities = {
    'admin-token': { userId, email: 'admin@example.test', role: 'admin', firmId },
    'attorney-token': { userId, email: 'attorney@example.test', role: 'attorney', firmId },
    'viewer-token': { userId, email: 'viewer@example.test', role: 'viewer', firmId },
    'other-admin-token': { userId, email: 'other@example.test', role: 'admin', firmId: otherFirmId },
  };
  const authenticate = (request_, _response, next) => {
    const identity = identities[request_.get('authorization')?.replace('Bearer ', '')];
    if (!identity) return next(unauthorized());
    request_.auth = identity;
    return next();
  };
  const list = { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } };
  const ensureFirm = (scope) => {
    if (scope !== firmId) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  };
  return createApp({
    authenticate,
    authenticateIdentity: authenticate,
    authService: {
      async invitationDetails() { return { invitation: null }; },
      async acceptInvitation() { return { accepted: true }; },
      async issueInvitation() { return { id: recordId }; },
    },
    provisioningService: { async provisionFirm() { return { firmId, userId }; } },
    searchService: { async search() { return searchResponse(); } },
    searchResultService: {
      async persistSearch({ searchResponse: searched }) {
        const searchId = recordId;
        return {
          response: {
            searchId,
            results: searched.results.map((hit) => ({
              id: hit.recordId, searchId, candidateMarkText: hit.markText,
              candidateSource: hit.sourceRegistry, candidateRef: hit.sourceReferenceId,
              owner: hit.owner, jurisdiction: hit.jurisdiction, niceClasses: hit.niceClasses,
              filingDate: hit.filingDate, status: hit.status, riskAnalysis: hit.riskAnalysis,
            })),
            sourceStatuses: searched.sourceStatuses,
            partial: searched.partial,
            requestId: searched.requestId,
          },
        };
      },
      async listSearchResults() { return { searchResults: [], nextCursor: null }; },
      async getSearchResult() { return {}; },
    },
    officeActionSearchService: {
      async searchOfficeActions() { return { results: [], sourceStatuses: [], partial: false, requestId: 'office-action-1' }; },
    },
    portfolioMarkService: {
      async createPortfolioMark(payload) { calls.push(['portfolio.create', payload]); return record(); },
      async listPortfolioMarks(payload) { calls.push(['portfolio.list', payload]); return list; },
      async getPortfolioMark(payload) { ensureFirm(payload.firmId); return record(); },
      async updatePortfolioMark(payload) { ensureFirm(payload.firmId); return record(payload.input); },
      async deletePortfolioMark(payload) { ensureFirm(payload.firmId); },
    },
    watchService: {
      defaultPollIntervalMinutes: 60,
      async createWatch(payload) { calls.push(['watch.create', payload]); return { id: recordId, firmId, ...watchInput }; },
      async listWatches(payload) { calls.push(['watch.list', payload]); return list; },
      async getWatch(payload) { ensureFirm(payload.firmId); return { id: recordId, firmId, ...watchInput }; },
      async updateWatch(payload) { ensureFirm(payload.firmId); return { id: recordId, firmId, ...watchInput, ...payload.input }; },
      async deleteWatch(payload) { ensureFirm(payload.firmId); },
    },
    alertService: {
      async listAlerts(payload) { calls.push(['alert.list', payload]); return list; },
      async getAlert(payload) { ensureFirm(payload.firmId); return { id: recordId, firmId, status: 'unread' }; },
      async transitionAlert(payload) { ensureFirm(payload.firmId); return { id: recordId, firmId, status: payload.input.action === 'read' ? 'read' : 'dismissed' }; },
    },
    auditService: { async list(payload) { calls.push(['audit.list', payload]); return { auditLogs: [], nextCursor: null }; } },
    userRoleService: { async changeRole(payload) { calls.push(['user.role', payload]); return { id: payload.targetUserId, role: payload.input.role, active: true }; } },
    officeActionRefService: {
      async createOfficeActionRef(payload) { calls.push(['office-action.create', payload]); return { id: recordId, ...officeActionInput }; },
      async listOfficeActionRefs(payload) { calls.push(['office-action.list', payload]); return list; },
      async getOfficeActionRef(payload) { ensureFirm(payload.firmId); return { id: recordId, ...officeActionInput }; },
      async updateOfficeActionRef(payload) { ensureFirm(payload.firmId); return { id: recordId, ...officeActionInput, ...payload.input }; },
      async deleteOfficeActionRef(payload) { ensureFirm(payload.firmId); },
    },
    exportService: {
      async createExport(payload) { calls.push(['export.create', payload]); return { created: true, export: { id: recordId, status: 'queued' } }; },
      async listExports(payload) { calls.push(['export.list', payload]); return { exports: [], nextCursor: null }; },
      async getExport(payload) { ensureFirm(payload.firmId); return { id: recordId, status: 'completed' }; },
      async download(payload) { ensureFirm(payload.firmId); return { id: recordId, mimeType: 'application/pdf', body: Buffer.from('%PDF-test') }; },
    },
  });
}

function authenticated(testRequest, token = 'admin-token') {
  return testRequest.set('Authorization', `Bearer ${token}`);
}

describe('Phase 2 mounted route inventory', () => {
  it('serves every required non-deferred Phase 2 method before the terminal 404 handler when search is enabled', async () => {
    const app = createTestApp();
    const routes = [
      ['GET', '/api/v1/auth/invitations/test-token'],
      ['POST', '/api/v1/auth/invitations/test-token/accept', { fullName: 'Test User' }],
      ['POST', '/api/v1/provisioning/firm', { firmName: 'Test Firm' }, 'admin-token'],
      ['GET', '/api/v1/me'],
      ['POST', '/api/v1/admin/invitations', { fullName: 'Test User', email: 'test@example.test', role: 'viewer' }],
      ['GET', '/api/v1/admin/ping'], ['GET', '/api/v1/attorney/ping', undefined, 'attorney-token'],
      ['GET', '/api/v1/viewer/ping', undefined, 'viewer-token'], ['GET', `/api/v1/firms/${firmId}/ping`],
      ['GET', '/api/v1/search?mark=PHASE2'],
      ['GET', '/api/v1/search-results'], ['GET', `/api/v1/search-results/${recordId}`],
      ['GET', '/api/v1/office-actions/search?markText=PHASE2'],
      ['POST', '/api/v1/portfolio-marks', portfolioInput], ['GET', '/api/v1/portfolio-marks'],
      ['GET', `/api/v1/portfolio-marks/${recordId}`], ['PATCH', `/api/v1/portfolio-marks/${recordId}`, { status: 'filed' }],
      ['DELETE', `/api/v1/portfolio-marks/${recordId}`],
      ['POST', '/api/v1/watches', watchInput], ['GET', '/api/v1/watches'], ['GET', `/api/v1/watches/${recordId}`],
      ['PATCH', `/api/v1/watches/${recordId}`, { state: 'paused' }], ['DELETE', `/api/v1/watches/${recordId}`],
      ['GET', '/api/v1/alerts'], ['GET', `/api/v1/alerts/${recordId}`],
      ['PATCH', `/api/v1/alerts/${recordId}`, { action: 'read' }], ['GET', '/api/v1/audit-logs'],
      ['PATCH', `/api/v1/users/${recordId}/role`, { role: 'viewer' }],
      ['POST', `/api/v1/portfolio-marks/${recordId}/office-action-refs`, officeActionInput],
      ['GET', `/api/v1/portfolio-marks/${recordId}/office-action-refs`],
      ['GET', `/api/v1/portfolio-marks/${recordId}/office-action-refs/${recordId}`],
      ['PATCH', `/api/v1/portfolio-marks/${recordId}/office-action-refs/${recordId}`, { documentType: 'final_office_action' }],
      ['DELETE', `/api/v1/portfolio-marks/${recordId}/office-action-refs/${recordId}`],
      ['POST', '/api/v1/exports', exportInput], ['GET', '/api/v1/exports'],
      ['GET', `/api/v1/exports/${recordId}`], ['GET', `/api/v1/exports/${recordId}/download`],
    ];
    for (const [method, path, body, token] of routes) {
      let request_ = request(app)[method.toLowerCase()](path);
      if (!path.startsWith('/api/v1/auth/')) request_ = authenticated(request_, token);
      if (body !== undefined) request_ = request_.send(body);
      const response = await request_;
      assert.notEqual(response.status, 404, `${method} ${path} must be mounted before the terminal 404 handler`);
      assert.ok(response.status >= 200 && response.status < 300, `${method} ${path} returned ${response.status}`);
    }
  });
});

describe('Phase 2 authorization and firm-isolation regression matrix', () => {
  it('rejects unauthenticated access and keeps viewer access read-only', async () => {
    const app = createTestApp();
    for (const path of ['/api/v1/me', '/api/v1/search?mark=PHASE2', '/api/v1/search-results', '/api/v1/office-actions/search?markText=PHASE2', '/api/v1/portfolio-marks', '/api/v1/watches', '/api/v1/alerts', '/api/v1/audit-logs', '/api/v1/exports']) {
      assert.equal((await request(app).get(path)).status, 401, path);
    }
    for (const [method, path, body] of [
      ['post', '/api/v1/portfolio-marks', portfolioInput],
      ['post', '/api/v1/watches', watchInput],
      ['patch', `/api/v1/alerts/${recordId}`, { action: 'read' }],
      ['post', `/api/v1/portfolio-marks/${recordId}/office-action-refs`, officeActionInput],
      ['post', '/api/v1/exports', exportInput],
    ]) {
      assert.equal((await authenticated(request(app)[method](path), 'viewer-token').send(body)).status, 403, path);
    }
    for (const path of ['/api/v1/search?mark=PHASE2', '/api/v1/search-results', '/api/v1/office-actions/search?markText=PHASE2', '/api/v1/portfolio-marks', '/api/v1/watches', '/api/v1/alerts']) {
      assert.equal((await authenticated(request(app).get(path), 'viewer-token')).status, 200, path);
    }
  });

  it('keeps audit logs and role changes Admin-only while allowing Attorney mutations', async () => {
    const app = createTestApp();
    for (const token of ['attorney-token', 'viewer-token']) {
      assert.equal((await authenticated(request(app).get('/api/v1/audit-logs'), token)).status, 403);
      assert.equal((await authenticated(request(app).patch(`/api/v1/users/${recordId}/role`), token).send({ role: 'viewer' })).status, 403);
    }
    assert.equal((await authenticated(request(app).post('/api/v1/portfolio-marks'), 'attorney-token').send(portfolioInput)).status, 201);
    assert.equal((await authenticated(request(app).post('/api/v1/watches'), 'attorney-token').send(watchInput)).status, 201);
    assert.equal((await authenticated(request(app).patch(`/api/v1/alerts/${recordId}`), 'attorney-token').send({ action: 'dismiss' })).status, 200);
    assert.equal((await authenticated(request(app).post(`/api/v1/portfolio-marks/${recordId}/office-action-refs`), 'attorney-token').send(officeActionInput)).status, 201);
    assert.equal((await authenticated(request(app).post('/api/v1/exports'), 'attorney-token').send(exportInput)).status, 202);
    assert.equal((await authenticated(request(app).get('/api/v1/audit-logs'), 'admin-token')).status, 200);
  });

  it('uses authenticated firm context and hides cross-firm resources', async () => {
    const calls = [];
    const app = createTestApp({ calls });
    const crossFirm = await authenticated(request(app).get(`/api/v1/portfolio-marks/${recordId}`), 'other-admin-token');
    assert.equal(crossFirm.status, 404);
    const crossFirmNested = await authenticated(
      request(app).get(`/api/v1/portfolio-marks/${recordId}/office-action-refs/${recordId}`),
      'other-admin-token',
    );
    assert.equal(crossFirmNested.status, 404);
    const crossFirmExport = await authenticated(request(app).get(`/api/v1/exports/${recordId}`), 'other-admin-token');
    assert.equal(crossFirmExport.status, 404);
    const invalidOverride = await authenticated(request(app).post('/api/v1/portfolio-marks'), 'admin-token')
      .send({ ...portfolioInput, firmId: otherFirmId });
    assert.equal(invalidOverride.status, 400);
    const nestedOverride = await authenticated(request(app).post(`/api/v1/portfolio-marks/${recordId}/office-action-refs`), 'admin-token')
      .send({ ...officeActionInput, firmId: otherFirmId });
    assert.equal(nestedOverride.status, 400);
    const exportOverride = await authenticated(request(app).post('/api/v1/exports'), 'admin-token')
      .send({ ...exportInput, firmId: otherFirmId });
    assert.equal(exportOverride.status, 400);
    assert.equal(calls.some(([name]) => name === 'portfolio.create'), false);
    assert.equal(calls.some(([name]) => name === 'office-action.create' || name === 'export.create'), false);
  });
});
