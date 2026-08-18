import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { describe, it } from 'node:test';
import { createSearchRouter } from '../../src/routes/search-routes.js';
import { errorHandler, unauthorized } from '../../src/errors.js';

const identities = {
  'admin-token': { userId: 'admin-1', role: 'admin', firmId: 'firm-1' },
  'attorney-token': { userId: 'attorney-1', role: 'attorney', firmId: 'firm-1' },
  'viewer-token': { userId: 'viewer-1', role: 'viewer', firmId: 'firm-1' },
  'owner-token': { userId: 'owner-1', role: 'owner', firmId: 'firm-1' },
};

function testApp(searchService, calls = []) {
  const authenticate = (request, _response, next) => {
    const identity = identities[request.get('authorization')?.replace('Bearer ', '')];
    if (!identity) return next(unauthorized());
    request.auth = identity;
    return next();
  };
  const app = express();
  app.use('/api/v1', createSearchRouter(authenticate, {
    async search(query) {
      calls.push(query);
      return searchService.search(query);
    },
  }));
  app.use(errorHandler);
  return app;
}

function successfulSearch() {
  return {
    async search() {
      return {
        results: [{
          recordId: 'es-id-1',
          markText: 'NIMBL',
          sourceRegistry: 'USPTO',
          sourceReferenceId: 'USPTO-123',
          owner: null,
          jurisdiction: 'US',
          niceClasses: [9, 42],
          filingDate: null,
          status: 'registered',
          relevanceScore: 99,
        }],
        sourceStatuses: [
          { source: 'USPTO', status: 'complete', resultCount: 1 },
          { source: 'EUIPO', status: 'unavailable', resultCount: 0 },
        ],
        partial: true,
        requestId: 'request-1',
      };
    },
  };
}

describe('GET /api/v1/search boundary', () => {
  it('requires authentication and validates the search service at construction', async () => {
    const response = await request(testApp(successfulSearch())).get('/api/v1/search?mark=AB');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHORIZED');
    assert.throws(() => createSearchRouter(() => {}, null), /needs a search service/);
  });

  it('allows admin, attorney, and viewer roles', async () => {
    for (const token of ['admin-token', 'attorney-token', 'viewer-token']) {
      const response = await request(testApp(successfulSearch()))
        .get('/api/v1/search?mark=NIMBL')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(response.status, 200);
    }
  });

  it('rejects unsupported roles before calling the service', async () => {
    let called = false;
    const response = await request(testApp({
      async search() { called = true; return successfulSearch().search(); },
    })).get('/api/v1/search?mark=NIMBL').set('Authorization', 'Bearer owner-token');
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'FORBIDDEN');
    assert.equal(called, false);
  });

  it('normalizes the query before passing it to the service', async () => {
    const calls = [];
    const response = await request(testApp(successfulSearch(), calls))
      .get('/api/v1/search?mark=%20NIMBL%20&jurisdiction=us&jurisdiction=US&class=9%2C42&status=registered&owner=%20Nimbl%20&filedFrom=2025-01-01&filedTo=2026-01-01')
      .set('Authorization', 'Bearer admin-token');
    assert.equal(response.status, 200);
    assert.deepEqual(calls[0], {
      mark: 'NIMBL', jurisdictions: ['US'], niceClasses: [9, 42], status: 'registered',
      owner: 'Nimbl', filedFrom: '2025-01-01', filedTo: '2026-01-01',
    });
  });

  it('returns validation errors for invalid, unsupported, nested, or snapshot queries', async () => {
    for (const query of [
      '?mark=A', '?mark=NIMBL&status=filed', '?mark=NIMBL&filedFrom=2026-02-30',
      '?mark=NIMBL&filedFrom=2026-03-01&filedTo=2026-02-01',
      '?mark=NIMBL&resultId=old-result', '?mark=NIMBL&role=admin', '?mark=NIMBL&owner[nested]=x',
    ]) {
      const response = await request(testApp(successfulSearch()))
        .get(`/api/v1/search${query}`).set('Authorization', 'Bearer viewer-token');
      assert.equal(response.status, 400, query);
      assert.equal(response.body.code, 'VALIDATION_ERROR', query);
    }
  });

  it('maps internal hits to the API response while preserving provenance and partial state', async () => {
    const response = await request(testApp(successfulSearch()))
      .get('/api/v1/search?mark=NIMBL').set('Authorization', 'Bearer attorney-token');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      results: [{
        id: 'es-id-1', searchId: 'request-1', candidateMarkText: 'NIMBL', candidateSource: 'USPTO',
        candidateRef: 'USPTO-123', owner: null, jurisdiction: 'US', niceClasses: [9, 42],
        filingDate: null, status: 'registered',
      }],
      sourceStatuses: [
        { source: 'USPTO', status: 'complete', resultCount: 1 },
        { source: 'EUIPO', status: 'unavailable', resultCount: 0 },
      ],
      partial: true,
      requestId: 'request-1',
    });
    assert.equal(JSON.stringify(response.body).includes('riskScore'), false);
    assert.equal(JSON.stringify(response.body).includes('relevanceScore'), false);
  });

  it('passes service failures to the normalized error handler without exposing internals', async () => {
    const response = await request(testApp({
      async search() { throw new Error('Elasticsearch body and credentials must not escape'); },
    })).get('/api/v1/search?mark=NIMBL').set('Authorization', 'Bearer admin-token');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      code: 'INTERNAL_ERROR', message: 'The request could not be completed.',
    });
    assert.equal(JSON.stringify(response.body).includes('credentials'), false);
  });
});
