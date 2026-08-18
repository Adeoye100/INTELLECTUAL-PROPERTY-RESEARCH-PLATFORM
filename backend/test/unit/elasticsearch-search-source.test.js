import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ElasticsearchSearchSource,
  ElasticsearchSearchSourceError,
} from '../../src/search/elasticsearch-search-source.js';

const sourceName = 'USPTO';
const baseUrl = 'https://elasticsearch.example.test:9243/root/';

function hit(overrides = {}) {
  return {
    _id: 'postgres-uuid-must-not-be-reference',
    _score: 4.25,
    _source: {
      mark_text: 'NIMBL',
      owner: 'Nimbl Ltd.',
      jurisdiction: 'US',
      nice_classes: [9, 42],
      status: 'registered',
      filing_date: '2026-01-05',
      source_registry: sourceName,
      source_reference_id: 'USPTO-serial-123',
      ...overrides,
    },
  };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

function fakeFetch(payload = { hits: { hits: [hit()] } }, status = 200) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(payload, status);
  };
  return { calls, fetchImpl };
}

function parseBody(call) {
  return JSON.parse(call.options.body);
}

describe('ElasticsearchSearchSource', () => {
  it('exposes the BE-09A source interface', async () => {
    const { fetchImpl } = fakeFetch();
    const source = new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl });

    assert.equal(source.sourceName, sourceName);
    assert.equal(typeof source.search, 'function');
    assert.deepEqual(await source.search({}), [
      {
        recordId: 'postgres-uuid-must-not-be-reference',
        markText: 'NIMBL',
        owner: 'Nimbl Ltd.',
        jurisdiction: 'US',
        niceClasses: [9, 42],
        status: 'registered',
        filingDate: '2026-01-05',
        sourceRegistry: 'USPTO',
        sourceReferenceId: 'USPTO-serial-123',
        relevanceScore: 4.25,
      },
    ]);
  });

  it('sends POST to the encoded index search path with bounded size', async () => {
    const { calls, fetchImpl } = fakeFetch();
    await new ElasticsearchSearchSource({
      sourceName,
      baseUrl,
      indexName: 'trademarks composite',
      fetchImpl,
      maxResults: 17,
    }).search({});

    assert.equal(calls[0].url, `${baseUrl.replace(/\/$/, '')}/trademarks%20composite/_search`);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(parseBody(calls[0]).size, 17);
  });

  it('always filters by source registry and includes fuzzy and phonetic mark clauses', async () => {
    const { calls, fetchImpl } = fakeFetch();
    await new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl }).search({ mark: 'NIMBL' });
    const body = parseBody(calls[0]);
    const bool = body.query.bool;

    assert.deepEqual(bool.filter[0], { term: { source_registry: 'USPTO' } });
    assert.deepEqual(bool.must[0].bool.should, [
      { match: { mark_text: { query: 'NIMBL', fuzziness: 'AUTO' } } },
      { match: { 'mark_text.phonetic': { query: 'NIMBL' } } },
    ]);
    assert.equal(bool.must[0].bool.minimum_should_match, 1);
  });

  it('constructs jurisdiction and Nice-class terms filters', async () => {
    const { calls, fetchImpl } = fakeFetch();
    await new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl }).search({
      jurisdictions: ['US', 'EU'],
      niceClasses: [9, 42],
    });
    assert.deepEqual(parseBody(calls[0]).query.bool.filter, [
      { term: { source_registry: 'USPTO' } },
      { terms: { jurisdiction: ['US', 'EU'] } },
      { terms: { nice_classes: [9, 42] } },
    ]);
  });

  it('includes status, owner, and supplied filing date bounds only', async () => {
    const { calls, fetchImpl } = fakeFetch();
    const query = {
      status: 'registered', owner: 'Nimbl Ltd.', filedFrom: '2025-01-01', filedTo: '2026-01-01',
    };
    await new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl }).search(query);
    assert.deepEqual(parseBody(calls[0]).query.bool.filter, [
      { term: { source_registry: 'USPTO' } },
      { term: { status: 'registered' } },
      { term: { owner: 'Nimbl Ltd.' } },
      { range: { filing_date: { gte: '2025-01-01', lte: '2026-01-01' } } },
    ]);

    const empty = fakeFetch();
    await new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl: empty.fetchImpl }).search({
      status: '', owner: '', filedFrom: '', filedTo: '',
    });
    assert.deepEqual(parseBody(empty.calls[0]).query.bool.filter, [
      { term: { source_registry: 'USPTO' } },
    ]);
  });

  it('preserves genuine references, nullable fields, and excludes frontend/risk fields', async () => {
    const { fetchImpl } = fakeFetch({ hits: { hits: [hit({ owner: null, filing_date: null })] } });
    const [result] = await new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl }).search({});
    assert.equal(result.sourceReferenceId, 'USPTO-serial-123');
    assert.notEqual(result.sourceReferenceId, result.recordId);
    assert.equal(result.owner, null);
    assert.equal(result.filingDate, null);
    assert.equal(Object.hasOwn(result, 'riskScore'), false);
    assert.equal(Object.hasOwn(result, 'searchId'), false);
    assert.equal(Object.hasOwn(result, 'candidateRef'), false);
  });

  it('rejects malformed hits, including mismatched registry attribution', async () => {
    for (const payload of [
      { hits: {} },
      { hits: { hits: [{}] } },
      { hits: { hits: [hit({ source_registry: 'EUIPO' })] } },
      { hits: { hits: [hit({ source_reference_id: '' })] } },
    ]) {
      const { fetchImpl } = fakeFetch(payload);
      await assert.rejects(
        new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl }).search({}),
        (error) => error instanceof ElasticsearchSearchSourceError
          && ['ELASTICSEARCH_SEARCH_RESPONSE_INVALID', 'ELASTICSEARCH_SEARCH_HIT_INVALID'].includes(error.code),
      );
    }
  });

  it('normalizes HTTP, invalid JSON, network, and timeout failures', async () => {
    const http = fakeFetch({ error: 'sensitive response body' }, 503);
    await assert.rejects(
      new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl: http.fetchImpl }).search({ mark: 'secret query' }),
      (error) => error.code === 'ELASTICSEARCH_SEARCH_HTTP_ERROR' && !error.message.includes('sensitive'),
    );

    await assert.rejects(
      new ElasticsearchSearchSource({
        sourceName, baseUrl, fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new Error('body'); } }),
      }).search({}),
      (error) => error.code === 'ELASTICSEARCH_SEARCH_INVALID_JSON',
    );
    await assert.rejects(
      new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl: async () => { throw new Error('network secret'); } }).search({}),
      (error) => error.code === 'ELASTICSEARCH_SEARCH_NETWORK_ERROR' && !error.message.includes('network secret'),
    );
    await assert.rejects(
      new ElasticsearchSearchSource({
        sourceName, baseUrl, timeoutMs: 5,
        fetchImpl: (_url, options) => new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      }).search({}),
      (error) => error.code === 'ELASTICSEARCH_SEARCH_TIMEOUT',
    );
  });

  it('does not mutate input query and restricts source fields', async () => {
    const { calls, fetchImpl } = fakeFetch();
    const query = {
      mark: 'NIMBL', jurisdictions: ['US'], niceClasses: [9], status: 'registered',
      owner: 'Nimbl Ltd.', filedFrom: '2025-01-01', filedTo: '2026-01-01',
    };
    const original = structuredClone(query);
    await new ElasticsearchSearchSource({ sourceName, baseUrl, fetchImpl }).search(query);
    assert.deepEqual(query, original);
    assert.deepEqual(parseBody(calls[0])._source, [
      'mark_text', 'owner', 'jurisdiction', 'nice_classes', 'status', 'filing_date',
      'source_registry', 'source_reference_id',
    ]);
  });

  it('rejects invalid constructor options', () => {
    const valid = { sourceName, baseUrl, fetchImpl: async () => response({ hits: { hits: [] } }) };
    for (const options of [
      { ...valid, sourceName: '' },
      { ...valid, baseUrl: 'ftp://elasticsearch.test' },
      { ...valid, baseUrl: 'not-a-url' },
      { ...valid, fetchImpl: null },
      { ...valid, timeoutMs: 0 },
      { ...valid, timeoutMs: Infinity },
      { ...valid, maxResults: 0 },
      { ...valid, maxResults: 1.5 },
    ]) {
      assert.throws(() => new ElasticsearchSearchSource(options), TypeError);
    }
  });
});
