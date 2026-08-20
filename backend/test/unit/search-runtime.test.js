import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RiskEnrichedSearchService } from '../../src/risk/risk-enriched-search-service.js';
import { createSearchRuntime } from '../../src/search/search-runtime.js';

const enabledConfig = {
  searchEnabled: true,
  elasticsearchUrl: 'http://127.0.0.1:9200',
  searchSourceRegistries: ['USPTO', 'EUIPO'],
  searchSourceTimeoutMs: 1_500,
  searchMaxResults: 25,
};

describe('search runtime', () => {
  it('creates one configured Elasticsearch source per registry without network calls', () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; throw new Error('not reached'); };
    const { searchSources, federatedSearchService, searchService } = createSearchRuntime(enabledConfig, {
      fetchImpl, logger: { warn() {} }, requestIdFactory: () => 'request-1',
    });

    assert.equal(calls, 0);
    assert.ok(searchService instanceof RiskEnrichedSearchService);
    assert.strictEqual(searchService.searchService, federatedSearchService);
    assert.equal(federatedSearchService.sources.length, 2);
    assert.deepEqual(searchSources.map((source) => ({
      sourceName: source.sourceName,
      baseUrl: source.baseUrl,
      timeoutMs: source.timeoutMs,
      maxResults: source.maxResults,
      fetchImpl: source.fetchImpl,
    })), [
      { sourceName: 'USPTO', baseUrl: 'http://127.0.0.1:9200', timeoutMs: 1_500, maxResults: 25, fetchImpl },
      { sourceName: 'EUIPO', baseUrl: 'http://127.0.0.1:9200', timeoutMs: 1_500, maxResults: 25, fetchImpl },
    ]);
  });

  it('returns no sources or service when disabled', () => {
    assert.deepEqual(createSearchRuntime({ searchEnabled: false }), {
      searchSources: [], federatedSearchService: null, searchService: null,
    });
  });
});
