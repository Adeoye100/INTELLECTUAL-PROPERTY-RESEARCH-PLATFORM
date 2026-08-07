import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ElasticsearchProjector,
  syncRegistryTrademarksToElasticsearch,
} from '../../src/ingestion/elasticsearch-projector.js';
import { ingestRegistryUpdates } from '../../src/ingestion/ingest-registry.js';

describe('registry ingestion boundaries', () => {
  it('writes adapter records to PostgreSQL repository batches without touching Elasticsearch', async () => {
    const calls = [];
    const adapter = {
      sourceName: 'fixture registry',
      async *fetchUpdates() {
        yield { sourceReferenceId: 'one', sourceRegistry: 'USPTO' };
        yield { sourceReferenceId: 'two', sourceRegistry: 'USPTO' };
      },
    };
    const repository = {
      async upsertBatch(records) {
        calls.push(records);
        return records.length;
      },
    };

    const result = await ingestRegistryUpdates({
      adapter,
      repository,
      since: new Date('2026-01-05'),
      batchSize: 1,
    });
    assert.deepEqual(calls.map((records) => records[0].sourceReferenceId), ['one', 'two']);
    assert.deepEqual(result, { sourceName: 'fixture registry', processed: 2, changed: 2 });
  });

  it('projects pending PostgreSQL rows in a separate Elasticsearch bulk step', async () => {
    const row = {
      id: 'c2826bb3-088f-43aa-95de-61e4fd555429',
      mark_text: 'NIMBL VISUAL MEDIA & DESIGN',
      owner: 'Nimbl Marketing Co.',
      jurisdiction: 'US',
      nice_classes: [35, 41, 42],
      status: 'registered',
      filing_date: '2023-06-12',
      source_registry: 'USPTO',
      updated_at: '2026-01-05T05:29:00.000Z',
    };
    const repositoryCalls = [];
    const repository = {
      batches: [[row], []],
      async pendingProjection() { return this.batches.shift(); },
      async markProjected(rows) { repositoryCalls.push(rows); },
    };
    let request;
    const projector = new ElasticsearchProjector({
      baseUrl: 'http://elasticsearch.test:9200',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ errors: false, items: [] }) };
      },
    });

    assert.deepEqual(
      await syncRegistryTrademarksToElasticsearch({ repository, projector }),
      { projected: 1 },
    );
    assert.equal(request.url, 'http://elasticsearch.test:9200/_bulk');
    assert.match(request.options.body, /"_index":"trademarks_composite"/);
    assert.match(request.options.body, /"source_registry":"USPTO"/);
    assert.deepEqual(repositoryCalls, [[row]]);
  });
});
