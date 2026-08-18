import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { projectToElasticsearch } from '../../src/ingestion/elasticsearch-projector.js';
import {
  ensureElasticsearchIndices,
  OFFICE_ACTIONS_INDEX,
  SIMILARITY_VECTOR_DIMS,
  TRADEMARKS_COMPOSITE_INDEX,
} from '../../src/search/elasticsearch-indices.js';

const elasticsearchUrl = process.env.TEST_ELASTICSEARCH_URL?.trim();
if (!elasticsearchUrl) {
  throw new Error(
    'Real Elasticsearch integration storage is required. Set TEST_ELASTICSEARCH_URL; '
    + 'the documented compose setup provides it.',
  );
}

const baseUrl = elasticsearchUrl.replace(/\/$/, '');
const phoneticDocumentId = `phonetic-${randomUUID()}`;
const projectedDocumentId = randomUUID();

async function elasticsearch(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`Elasticsearch request ${path} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

before(async () => {
  await ensureElasticsearchIndices({ baseUrl });
});

after(async () => {
  await Promise.allSettled([
    fetch(`${baseUrl}/${TRADEMARKS_COMPOSITE_INDEX}/_doc/${phoneticDocumentId}`, { method: 'DELETE' }),
    fetch(`${baseUrl}/${TRADEMARKS_COMPOSITE_INDEX}/_doc/${projectedDocumentId}`, { method: 'DELETE' }),
  ]);
});

describe('Elasticsearch composite indices', () => {
  it('creates both exact mappings idempotently', async () => {
    const repeated = await ensureElasticsearchIndices({ baseUrl });
    assert.deepEqual(repeated, [
      { name: TRADEMARKS_COMPOSITE_INDEX, created: false },
      { name: OFFICE_ACTIONS_INDEX, created: false },
    ]);

    const mappings = await elasticsearch(`/${TRADEMARKS_COMPOSITE_INDEX}/_mapping`);
    const properties = mappings[TRADEMARKS_COMPOSITE_INDEX].mappings.properties;
    assert.equal(properties.mark_text.type, 'text');
    assert.equal(properties.mark_text.fields.phonetic.analyzer, 'trademark_phonetic');
    assert.equal(properties.similarity_vector.type, 'dense_vector');
    assert.equal(properties.similarity_vector.dims, SIMILARITY_VECTOR_DIMS);
    assert.equal(properties.similarity_vector.index, false);
    assert.equal(properties.source_reference_id.type, 'keyword');

    const officeMappings = await elasticsearch(`/${OFFICE_ACTIONS_INDEX}/_mapping`);
    const officeProperties = officeMappings[OFFICE_ACTIONS_INDEX].mappings.properties;
    assert.equal(officeProperties.reference_text.type, 'text');
    assert.equal(officeProperties.examiner_reasoning.type, 'text');
    assert.equal(officeProperties.related_classes.type, 'integer');
    assert.equal(officeProperties.related_marks.type, 'keyword');
  });

  it('retrieves Kwik when the phonetic field is queried for Quick', async () => {
    await elasticsearch(`/${TRADEMARKS_COMPOSITE_INDEX}/_doc/${phoneticDocumentId}?refresh=wait_for`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mark_text: 'Kwik',
        owner: 'Phonetic Test Owner',
        jurisdiction: 'NG',
        nice_classes: [42],
        status: 'filed',
        filing_date: '2026-08-08',
        source_registry: 'TEST',
        source_reference_id: 'TEST-PHONETIC-1',
      }),
    });

    const result = await elasticsearch(`/${TRADEMARKS_COMPOSITE_INDEX}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match: { 'mark_text.phonetic': 'Quick' } } }),
    });
    assert.ok(result.hits.hits.some(({ _id: id }) => id === phoneticDocumentId));
  });

  it('projectToElasticsearch writes a PostgreSQL-shaped trademark record', async () => {
    await projectToElasticsearch({
      id: projectedDocumentId,
      mark_text: 'FORGE GLOBAL',
      owner: 'Forge Example Ltd.',
      jurisdiction: 'NG',
      nice_classes: [9, 42],
      status: 'registered',
      filing_date: '2025-11-14',
      source_registry: 'NIPO',
      source_reference_id: 'NIPO-REFERENCE-1',
    }, { baseUrl });

    const stored = await elasticsearch(`/${TRADEMARKS_COMPOSITE_INDEX}/_doc/${projectedDocumentId}`);
    assert.deepEqual(stored._source, {
      mark_text: 'FORGE GLOBAL',
      owner: 'Forge Example Ltd.',
      jurisdiction: 'NG',
      nice_classes: [9, 42],
      status: 'registered',
      filing_date: '2025-11-14',
      source_registry: 'NIPO',
      source_reference_id: 'NIPO-REFERENCE-1',
    });
  });
});
