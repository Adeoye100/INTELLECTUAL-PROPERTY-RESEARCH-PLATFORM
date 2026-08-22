import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { describe, it } from 'node:test';
import { createSearchRouter } from '../../src/routes/search-routes.js';
import { errorHandler, unauthorized } from '../../src/errors.js';
import { RiskEnrichmentError } from '../../src/risk/risk-enriched-search-service.js';

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
  const searchId = '99999999-9999-4999-8999-999999999999';
  const searchResultService = {
    async persistSearch({ searchResponse }) {
      return {
        response: {
          searchId,
          results: searchResponse.results.map((hit) => ({
            id: hit.recordId, searchId, candidateMarkText: hit.markText,
            candidateSource: hit.sourceRegistry, candidateRef: hit.sourceReferenceId,
            owner: hit.owner, jurisdiction: hit.jurisdiction, niceClasses: hit.niceClasses,
            filingDate: hit.filingDate, status: hit.status, riskAnalysis: hit.riskAnalysis,
          })),
          sourceStatuses: searchResponse.sourceStatuses,
          partial: searchResponse.partial,
          requestId: searchResponse.requestId,
        },
      };
    },
  };
  app.use('/api/v1', createSearchRouter(authenticate, {
    async search(query) {
      calls.push(query);
      return searchService.search(query);
    },
  }, { searchResultService }));
  app.use(errorHandler);
  return app;
}

function riskAnalysisFor(hit) {
  return {
    candidateRecordId: hit.recordId,
    candidateSource: hit.sourceRegistry,
    candidateRef: hit.sourceReferenceId,
    phoneticScore: 100,
    visualScore: 100,
    conceptualScore: null,
    classOverlap: true,
    classOverlapScore: 100,
    compositeScore: 100,
    compositeRating: 'high',
    methodology: {
      version: 'confusion-risk-v1.0.0-provisional',
      description: 'Synthetic test research signal.',
      sourceAttribution: [hit.sourceRegistry],
    },
    matchedMarkRefs: [
      { type: 'Visual', evidence: 'Synthetic visual evidence: 100/100.', score: 100 },
      { type: 'Phonetic', evidence: 'Synthetic phonetic evidence: 100/100.', score: 100 },
      { type: 'Class', evidence: 'Synthetic class evidence: 9, 42 (100/100).', score: 100 },
    ],
  };
}

function successfulSearch() {
  const hit = {
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
  };
  return {
    async search() {
      return {
        results: [{ ...hit, riskAnalysis: riskAnalysisFor(hit) }],
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
    assert.throws(() => createSearchRouter(() => {}, successfulSearch()), /needs a search result service/);
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
      searchId: '99999999-9999-4999-8999-999999999999',
      results: [{
        id: 'es-id-1', searchId: '99999999-9999-4999-8999-999999999999', candidateMarkText: 'NIMBL', candidateSource: 'USPTO',
        candidateRef: 'USPTO-123', owner: null, jurisdiction: 'US', niceClasses: [9, 42],
        filingDate: null, status: 'registered', riskAnalysis: riskAnalysisFor({
          recordId: 'es-id-1', sourceRegistry: 'USPTO', sourceReferenceId: 'USPTO-123',
        }),
      }],
      sourceStatuses: [
        { source: 'USPTO', status: 'complete', resultCount: 1 },
        { source: 'EUIPO', status: 'unavailable', resultCount: 0 },
      ],
      partial: true,
      requestId: 'request-1',
    });
    assert.equal(response.body.results[0].riskAnalysis.methodology.version, 'confusion-risk-v1.0.0-provisional');
    assert.equal(response.body.results[0].riskAnalysis.conceptualScore, null);
    assert.deepEqual(response.body.results[0].riskAnalysis.matchedMarkRefs.map(({ type }) => type), ['Visual', 'Phonetic', 'Class']);
    assert.equal(JSON.stringify(response.body).includes('riskScore'), false);
    assert.equal(JSON.stringify(response.body).includes('relevanceScore'), false);
    assert.equal(JSON.stringify(response.body).includes('risk_score_id'), false);
    assert.equal(JSON.stringify(response.body).includes('riskScoreId'), false);
  });

  it('returns the stable risk-enrichment failure without changing source partial state', async () => {
    const response = await request(testApp({
      async search() { throw new RiskEnrichmentError(); },
    })).get('/api/v1/search?mark=NIMBL').set('Authorization', 'Bearer admin-token');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      code: 'RISK_ENRICHMENT_FAILED', message: 'Risk evidence could not be calculated.',
    });
    assert.equal(Object.hasOwn(response.body, 'partial'), false);
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
