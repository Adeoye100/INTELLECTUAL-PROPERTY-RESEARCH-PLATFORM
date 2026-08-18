import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureElasticsearchIndices,
  indexDefinitions,
  OFFICE_ACTIONS_INDEX,
  SIMILARITY_VECTOR_DIMS,
  TRADEMARKS_COMPOSITE_INDEX,
} from '../../src/search/elasticsearch-indices.js';

function response(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body; },
  };
}

describe('Elasticsearch index management', () => {
  it('defines the exact composite and office-action field mappings', () => {
    const composite = indexDefinitions[TRADEMARKS_COMPOSITE_INDEX];
    assert.deepEqual(Object.keys(composite.mappings.properties), [
      'mark_text', 'owner', 'jurisdiction', 'nice_classes', 'status',
      'filing_date', 'source_registry', 'source_reference_id', 'similarity_vector',
    ]);
    assert.equal(composite.mappings.properties.mark_text.analyzer, 'standard');
    assert.deepEqual(composite.mappings.properties.mark_text.fields.phonetic, {
      type: 'text',
      analyzer: 'trademark_phonetic',
      search_analyzer: 'trademark_phonetic',
    });
    assert.deepEqual(composite.settings.analysis.filter.trademark_double_metaphone, {
      type: 'phonetic', encoder: 'double_metaphone', replace: true,
    });
    assert.deepEqual(composite.mappings.properties.similarity_vector, {
      type: 'dense_vector', dims: SIMILARITY_VECTOR_DIMS, index: false,
    });
    assert.deepEqual(composite.mappings.properties.source_reference_id, { type: 'keyword' });

    const officeActions = indexDefinitions[OFFICE_ACTIONS_INDEX];
    assert.deepEqual(officeActions.mappings.properties, {
      reference_text: { type: 'text' },
      examiner_reasoning: { type: 'text' },
      related_classes: { type: 'integer' },
      related_marks: { type: 'keyword' },
    });
  });

  it('creates missing indices and safely reports them as existing on repeat', async () => {
    const stored = new Map();
    const requests = [];
    const fetchImpl = async (url, options) => {
      const name = decodeURIComponent(new URL(url).pathname.slice(1));
      requests.push({ name, options });
      if (options.method === 'HEAD') return response(stored.has(name) ? 200 : 404);
      if (options.method === 'PUT') {
        stored.set(name, JSON.parse(options.body));
        return response(200, '{"acknowledged":true}');
      }
      return response(405);
    };

    assert.deepEqual(
      await ensureElasticsearchIndices({ baseUrl: 'http://elasticsearch.test:9200/', fetchImpl }),
      [
        { name: TRADEMARKS_COMPOSITE_INDEX, created: true },
        { name: OFFICE_ACTIONS_INDEX, created: true },
      ],
    );
    assert.deepEqual(
      await ensureElasticsearchIndices({ baseUrl: 'http://elasticsearch.test:9200', fetchImpl }),
      [
        { name: TRADEMARKS_COMPOSITE_INDEX, created: false },
        { name: OFFICE_ACTIONS_INDEX, created: false },
      ],
    );
    assert.deepEqual(stored.get(TRADEMARKS_COMPOSITE_INDEX), indexDefinitions[TRADEMARKS_COMPOSITE_INDEX]);
    assert.equal(requests.filter(({ options }) => options.method === 'PUT').length, 2);
  });
});
