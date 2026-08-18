import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ElasticsearchProjector,
  projectToElasticsearch,
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
      source_reference_id: 'USPTO-12345',
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

  it('projectToElasticsearch writes one PostgreSQL-shaped row in the composite shape', async () => {
    let request;
    const row = {
      id: '34db3bd4-b9f4-4907-83c6-b79f25a19af7',
      firm_id: 'not-projected',
      mark_text: 'KWIK SEARCH',
      owner: 'Example Owner',
      jurisdiction: 'NG',
      nice_classes: [9, 42],
      status: 'filed',
      filing_date: '2026-08-08',
      source_registry: 'NIPO',
      source_reference_id: 'NIPO-98765',
      updated_at: '2026-08-08T10:00:00.000Z',
    };

    await projectToElasticsearch(row, {
      baseUrl: 'http://elasticsearch.test:9200/',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ errors: false, items: [] }) };
      },
    });

    assert.equal(request.url, 'http://elasticsearch.test:9200/_bulk');
    const lines = request.options.body.trim().split('\n').map(JSON.parse);
    assert.deepEqual(lines, [
      { index: { _index: 'trademarks_composite', _id: row.id } },
      {
        mark_text: 'KWIK SEARCH',
        owner: 'Example Owner',
        jurisdiction: 'NG',
        nice_classes: [9, 42],
        status: 'filed',
        filing_date: '2026-08-08',
        source_registry: 'NIPO',
        source_reference_id: 'NIPO-98765',
      },
    ]);
  });

  it('projects the actual registry reference and never substitutes the PostgreSQL UUID', async () => {
    let request;
    const row = {
      id: '34db3bd4-b9f4-4907-83c6-b79f25a19af7',
      mark_text: 'REFERENCE TEST',
      owner: 'Example Owner',
      jurisdiction: 'US',
      nice_classes: [42],
      status: 'filed',
      filing_date: '2026-08-08',
      source_registry: 'USPTO',
      source_reference_id: 'serial-123456',
    };

    await projectToElasticsearch(row, {
      baseUrl: 'http://elasticsearch.test:9200',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ errors: false, items: [] }) };
      },
    });

    const [, document] = request.options.body.trim().split('\n').map(JSON.parse);
    assert.equal(document.source_registry, 'USPTO');
    assert.equal(document.source_reference_id, 'serial-123456');
    assert.notEqual(document.source_reference_id, row.id);
    assert.equal(Object.hasOwn(document, 'riskScore'), false);
    assert.equal(Object.hasOwn(document, 'candidateRef'), false);
  });

  it('rejects missing, empty, and whitespace-only registry references before fetching', async () => {
    for (const sourceReferenceId of [undefined, '', '   ']) {
      let fetched = false;
      await assert.rejects(
        projectToElasticsearch({
          id: '34db3bd4-b9f4-4907-83c6-b79f25a19af7',
          mark_text: 'INVALID REFERENCE',
          owner: null,
          jurisdiction: 'US',
          nice_classes: [],
          status: 'filed',
          filing_date: null,
          source_registry: 'USPTO',
          source_reference_id: sourceReferenceId,
        }, {
          baseUrl: 'http://elasticsearch.test:9200',
          fetchImpl: async () => {
            fetched = true;
            return { ok: true, json: async () => ({ errors: false, items: [] }) };
          },
        }),
        /non-empty source_reference_id/,
      );
      assert.equal(fetched, false);
    }
  });
});
