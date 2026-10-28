import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rebuildRegistryTrademarksInElasticsearch } from '../../src/ingestion/elasticsearch-rebuild.js';

function response(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body; },
    async json() { return JSON.parse(body); },
  };
}

describe('Elasticsearch registry rebuild', () => {
  it('creates a new index and fully projects the PostgreSQL corpus without marking rows', async () => {
    const requests = [];
    const repository = {
      async allProjection(limit, cursor, statuses) {
        assert.equal(limit, 1);
        assert.deepEqual(statuses, ['registered', 'pending']);
        if (!cursor) {
          return [{
            id: 'mark-1',
            mark_text: 'ACTIVE',
            owner: 'Owner',
            jurisdiction: 'US',
            nice_classes: [9],
            status: 'registered',
            filing_date: '2026-01-01',
            source_registry: 'USPTO',
            source_reference_id: '1',
            updated_at: '2026-10-28T00:00:00.000Z',
          }];
        }
        return [];
      },
      async markProjected() {
        throw new Error('full rebuild must not update PostgreSQL projection markers');
      },
    };
    const fetchImpl = async (url, options) => {
      requests.push({ url, options });
      if (options.method === 'HEAD') return response(404);
      if (options.method === 'PUT') return response(200, '{"acknowledged":true}');
      if (url.endsWith('/_bulk')) return response(200, '{"errors":false,"items":[]}');
      return response(405);
    };

    const result = await rebuildRegistryTrademarksInElasticsearch({
      repository,
      baseUrl: 'http://localhost:9200',
      indexName: 'trademarks_composite_rebuild_20261028',
      batchSize: 1,
      fetchImpl,
    });

    assert.deepEqual(result, {
      indexName: 'trademarks_composite_rebuild_20261028',
      created: true,
      projected: 1,
    });
    assert.equal(requests[0].options.method, 'HEAD');
    assert.equal(requests[1].options.method, 'PUT');
    assert.equal(requests[2].options.method, 'POST');
    assert.match(requests[2].options.body, /"_index":"trademarks_composite_rebuild_20261028"/);
  });
});
