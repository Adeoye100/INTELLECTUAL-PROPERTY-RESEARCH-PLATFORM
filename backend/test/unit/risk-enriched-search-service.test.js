import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RiskEnrichedSearchService,
  RiskEnrichmentError,
} from '../../src/risk/risk-enriched-search-service.js';

const query = { mark: 'Forge Labs', niceClasses: [9, 42] };

function result(overrides = {}) {
  return {
    recordId: 'record-1',
    markText: 'Forge Labs',
    niceClasses: [9, 42],
    sourceRegistry: 'USPTO',
    sourceReferenceId: 'US-100',
    relevanceScore: 1,
    ...overrides,
  };
}

function analysisFor(candidate, overrides = {}) {
  return {
    candidateRecordId: candidate.recordId,
    candidateSource: candidate.sourceRegistry,
    candidateRef: candidate.sourceReferenceId,
    phoneticScore: 80,
    visualScore: 80,
    conceptualScore: null,
    classOverlap: true,
    classOverlapScore: 100,
    compositeScore: 80,
    compositeRating: 'high',
    methodology: {
      version: 'test-methodology-v1',
      description: 'Synthetic test research signal.',
      sourceAttribution: [candidate.sourceRegistry],
    },
    matchedMarkRefs: [
      { type: 'Visual', evidence: 'Synthetic visual evidence: 80/100.', score: 80 },
      { type: 'Phonetic', evidence: 'Synthetic phonetic evidence: 80/100.', score: 80 },
      { type: 'Class', evidence: 'Synthetic class evidence: 9 (100/100).', score: 100 },
    ],
    ...overrides,
  };
}

function createSearchService(response, options = {}) {
  let calls = 0;
  return {
    async search(receivedQuery) {
      calls += 1;
      if (options.error) throw options.error;
      if (options.onSearch) options.onSearch(receivedQuery);
      return response;
    },
    get calls() {
      return calls;
    },
  };
}

function createScorer(scoreFor = () => ({}), calls = []) {
  return ({ proposedMark, candidate }) => {
    calls.push({ proposedMark, candidate });
    return analysisFor(candidate, scoreFor(candidate));
  };
}

describe('RiskEnrichedSearchService', () => {
  it('rejects a missing search service', () => {
    assert.throws(() => new RiskEnrichedSearchService(), /requires a searchService/);
    assert.throws(() => new RiskEnrichedSearchService({ searchService: {} }), /requires a searchService/);
  });

  it('calls the underlying search once and maps proposed marks and classes to the scorer', async () => {
    const calls = [];
    const service = createSearchService({ results: [result()], sourceStatuses: [], partial: false, requestId: 'req-1' });
    await new RiskEnrichedSearchService({ searchService: service, riskScorer: createScorer(() => ({}), calls) }).search(query);

    assert.equal(service.calls, 1);
    assert.deepEqual(calls[0].proposedMark, { markText: 'Forge Labs', niceClasses: [9, 42] });
    assert.deepEqual(calls[0].candidate, {
      recordId: 'record-1', markText: 'Forge Labs', niceClasses: [9, 42],
      sourceRegistry: 'USPTO', sourceReferenceId: 'US-100',
    });
  });

  it('enriches every candidate while preserving provenance and response metadata', async () => {
    const statuses = [{ source: 'USPTO', status: 'complete', resultCount: 2 }];
    const response = {
      results: [result({ recordId: 'a', sourceReferenceId: 'US-A' }), result({ recordId: 'b', sourceReferenceId: 'US-B' })],
      sourceStatuses: statuses,
      partial: false,
      requestId: 'request-42',
    };
    const enriched = await new RiskEnrichedSearchService({
      searchService: createSearchService(response),
      riskScorer: createScorer(),
    }).search(query);

    assert.equal(enriched.results.every((entry) => entry.riskAnalysis !== undefined), true);
    assert.deepEqual(enriched.results.map((entry) => [entry.recordId, entry.sourceRegistry, entry.sourceReferenceId]), [
      ['a', 'USPTO', 'US-A'], ['b', 'USPTO', 'US-B'],
    ]);
    assert.strictEqual(enriched.sourceStatuses, statuses);
    assert.equal(enriched.partial, false);
    assert.equal(enriched.requestId, 'request-42');
  });

  it('supports empty result sets', async () => {
    const response = { results: [], sourceStatuses: [], partial: true, requestId: 'empty' };
    const enriched = await new RiskEnrichedSearchService({
      searchService: createSearchService(response), riskScorer: createScorer(),
    }).search(query);
    assert.deepEqual(enriched, response);
  });

  it('ranks High before Medium before Low, then breaks same-rating ties by composite score', async () => {
    const response = {
      results: [
        result({ recordId: 'low', sourceReferenceId: '3' }),
        result({ recordId: 'medium', sourceReferenceId: '2' }),
        result({ recordId: 'high-75', sourceReferenceId: '1' }),
        result({ recordId: 'high-90', sourceReferenceId: '0' }),
      ], sourceStatuses: [], partial: false, requestId: 'rank-1',
    };
    const scoreById = {
      low: { compositeRating: 'low', compositeScore: 49 },
      medium: { compositeRating: 'medium', compositeScore: 50 },
      'high-75': { compositeRating: 'high', compositeScore: 75 },
      'high-90': { compositeRating: 'high', compositeScore: 90 },
    };
    const enriched = await new RiskEnrichedSearchService({
      searchService: createSearchService(response),
      riskScorer: createScorer((candidate) => scoreById[candidate.recordId]),
    }).search(query);
    assert.deepEqual(enriched.results.map((entry) => entry.recordId), ['high-90', 'high-75', 'medium', 'low']);
  });

  it('uses Elasticsearch relevance only to break equal composite-score ties, with null last', async () => {
    const response = {
      results: [
        result({ recordId: 'null', sourceReferenceId: '3', relevanceScore: null }),
        result({ recordId: 'low-relevance', sourceReferenceId: '2', relevanceScore: 1 }),
        result({ recordId: 'high-relevance', sourceReferenceId: '1', relevanceScore: 10 }),
      ], sourceStatuses: [], partial: false, requestId: 'rank-2',
    };
    const enriched = await new RiskEnrichedSearchService({
      searchService: createSearchService(response), riskScorer: createScorer(),
    }).search(query);
    assert.deepEqual(enriched.results.map((entry) => entry.recordId), ['high-relevance', 'low-relevance', 'null']);
    assert.deepEqual(enriched.results.map((entry) => entry.riskAnalysis.compositeScore), [80, 80, 80]);
  });

  it('uses deterministic code-point registry and reference tie-breakers', async () => {
    const response = {
      results: [
        result({ recordId: 'z-ref', sourceRegistry: 'AA', sourceReferenceId: 'Z', relevanceScore: null }),
        result({ recordId: 'b-registry', sourceRegistry: 'B', sourceReferenceId: 'A', relevanceScore: null }),
        result({ recordId: 'a-ref', sourceRegistry: 'AA', sourceReferenceId: 'A', relevanceScore: null }),
      ], sourceStatuses: [], partial: false, requestId: 'rank-3',
    };
    const enriched = await new RiskEnrichedSearchService({
      searchService: createSearchService(response), riskScorer: createScorer(),
    }).search(query);
    assert.deepEqual(enriched.results.map((entry) => entry.recordId), ['a-ref', 'z-ref', 'b-registry']);
  });

  it('does not mutate the query, response, candidates, or source statuses', async () => {
    const response = {
      results: [result({ niceClasses: [42, 9, 9] })],
      sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 1 }],
      partial: false, requestId: 'immutable',
    };
    const input = { query: structuredClone(query), response: structuredClone(response) };
    const service = createSearchService(response);
    const scorer = createScorer((candidate) => {
      candidate.niceClasses.sort();
      return {};
    });
    await new RiskEnrichedSearchService({ searchService: service, riskScorer: scorer }).search(input.query);
    assert.deepEqual(input.query, query);
    assert.deepEqual(response, input.response);
  });

  it('propagates an underlying search error unchanged', async () => {
    const underlying = new Error('Underlying failure');
    const service = createSearchService(null, { error: underlying });
    await assert.rejects(
      () => new RiskEnrichedSearchService({ searchService: service, riskScorer: createScorer() }).search(query),
      (error) => error === underlying,
    );
  });

  it('fails closed with a stable safe code when scoring is invalid and returns no partial candidates', async () => {
    const service = createSearchService({
      results: [result({ recordId: 'good' }), result({ recordId: 'bad' })],
      sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 2 }], partial: false, requestId: 'fail',
    });
    const scorer = createScorer((candidate) => (candidate.recordId === 'bad'
      ? { matchedMarkRefs: [] }
      : {}));
    await assert.rejects(
      () => new RiskEnrichedSearchService({ searchService: service, riskScorer: scorer }).search(query),
      (error) => error instanceof RiskEnrichmentError
        && error.code === 'RISK_ENRICHMENT_FAILED'
        && error.message === 'Risk enrichment failed.',
    );
  });

  it('keeps conceptual scoring unavailable and complete evidence and methodology present', async () => {
    const enriched = await new RiskEnrichedSearchService({
      searchService: createSearchService({ results: [result()], sourceStatuses: [], partial: false, requestId: 'evidence' }),
      riskScorer: createScorer(),
    }).search(query);
    const { riskAnalysis } = enriched.results[0];
    assert.equal(riskAnalysis.conceptualScore, null);
    assert.deepEqual(riskAnalysis.matchedMarkRefs.map((entry) => entry.type), ['Visual', 'Phonetic', 'Class']);
    assert.equal(riskAnalysis.methodology.version, 'test-methodology-v1');
    assert.deepEqual(riskAnalysis.methodology.sourceAttribution, ['USPTO']);
  });

  it('does not pass Elasticsearch relevance to the scorer and repeats identically', async () => {
    const calls = [];
    const response = {
      results: [result({ recordId: 'b', relevanceScore: 100 }), result({ recordId: 'a', relevanceScore: 0 })],
      sourceStatuses: [], partial: false, requestId: 'repeat',
    };
    const service = new RiskEnrichedSearchService({
      searchService: createSearchService(response), riskScorer: createScorer(() => ({}), calls),
    });
    const first = await service.search(query);
    const second = await service.search(query);
    assert.equal(Object.hasOwn(calls[0].candidate, 'relevanceScore'), false);
    assert.equal(first.results[0].riskAnalysis.compositeScore, second.results[0].riskAnalysis.compositeScore);
    assert.deepEqual(first.results.map((entry) => entry.recordId), second.results.map((entry) => entry.recordId));
  });
});
