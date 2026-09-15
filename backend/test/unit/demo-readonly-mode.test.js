import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, it } from 'node:test';
import { createSearchRouter } from '../../src/routes/search-routes.js';
import { errorHandler } from '../../src/errors.js';
import { SearchFreshnessService } from '../../src/search/search-freshness-service.js';

const originalDemoMode = process.env.DEMO_READ_ONLY_MODE;
const originalFreshnessMode = process.env.SEARCH_FRESHNESS_MODE;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.DEMO_READ_ONLY_MODE;
  else process.env.DEMO_READ_ONLY_MODE = originalDemoMode;
  if (originalFreshnessMode === undefined) delete process.env.SEARCH_FRESHNESS_MODE;
  else process.env.SEARCH_FRESHNESS_MODE = originalFreshnessMode;
});

function demoHit() {
  const hit = {
    recordId: 'demo-record-1',
    markText: 'NIMBL',
    sourceRegistry: 'USPTO',
    sourceReferenceId: 'USPTO-123',
    owner: 'Demo Owner',
    jurisdiction: 'US',
    niceClasses: [9],
    filingDate: '2025-01-01',
    status: 'registered',
  };
  return {
    ...hit,
    riskAnalysis: {
      candidateRecordId: hit.recordId,
      candidateSource: hit.sourceRegistry,
      candidateRef: hit.sourceReferenceId,
      phoneticScore: 90,
      visualScore: 80,
      conceptualScore: null,
      classOverlap: true,
      classOverlapScore: 100,
      compositeScore: 88,
      compositeRating: 'high',
      methodology: {
        version: 'confusion-risk-v1.0.0-provisional',
        description: 'Demo research signal.',
        sourceAttribution: ['USPTO'],
      },
      matchedMarkRefs: [
        { type: 'Visual', evidence: 'Visual evidence.', score: 80 },
        { type: 'Phonetic', evidence: 'Phonetic evidence.', score: 90 },
        { type: 'Class', evidence: 'Class evidence.', score: 100 },
      ],
    },
  };
}

describe('explicit read-only presentation mode', () => {
  it('allows a non-empty partial corpus without claiming completeness', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'true';
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    const service = new SearchFreshnessService({
      repository: {
        async latestRun() { return null; },
        async latestCompleteRun() { return null; },
        async latestCompleteBaselineRun() { return null; },
        async corpusSummary() {
          return {
            recordCount: 2_000_000,
            dataThroughDate: '2026-04-02',
            indexedAt: '2026-09-15T11:00:00.000Z',
          };
        },
      },
    });

    const freshness = await service.assertSearchReady('USPTO');
    assert.equal(freshness.status, 'degraded');
    assert.equal(freshness.sourceMode, 'partial-demo-corpus');
    assert.equal(freshness.corpusComplete, false);
    assert.equal(freshness.demoReadOnly, true);
  });

  it('returns live search and risk evidence without attempting persistence', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'true';
    let persisted = false;
    const app = express();
    const authenticate = (req, _res, next) => {
      req.auth = { userId: 'user-1', role: 'viewer', firmId: 'firm-1' };
      next();
    };
    const hit = demoHit();
    app.use('/api/v1', createSearchRouter(authenticate, {
      async search() {
        return {
          results: [hit],
          sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 1 }],
          partial: true,
          requestId: 'demo-request-1',
          dataFreshness: {
            source: 'USPTO', status: 'degraded', dataThrough: '2026-04-02', indexedAt: '2026-09-15T11:00:00.000Z',
          },
        };
      },
    }, {
      searchResultService: {
        async persistSearch() {
          persisted = true;
          throw new Error('must not persist in read-only demo mode');
        },
      },
    }));
    app.use(errorHandler);

    const response = await request(app).get('/api/v1/search?mark=NIMBL');
    assert.equal(response.status, 200);
    assert.equal(persisted, false);
    assert.equal(response.body.demoReadOnly, true);
    assert.equal(response.body.results[0].riskAnalysis.compositeRating, 'high');
    assert.equal(response.body.dataFreshness.status, 'degraded');
    assert.match(response.body.searchId, /^[0-9a-f-]{36}$/i);
  });
});
