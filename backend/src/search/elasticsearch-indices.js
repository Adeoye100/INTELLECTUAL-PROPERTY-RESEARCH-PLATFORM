export const TRADEMARKS_COMPOSITE_INDEX = 'trademarks_composite';
export const OFFICE_ACTIONS_INDEX = 'office_actions';
export const SIMILARITY_VECTOR_DIMS = 384;

export const indexDefinitions = Object.freeze({
  [TRADEMARKS_COMPOSITE_INDEX]: {
    settings: {
      analysis: {
        filter: {
          trademark_double_metaphone: {
            type: 'phonetic',
            encoder: 'double_metaphone',
            replace: true,
          },
        },
        analyzer: {
          trademark_phonetic: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'trademark_double_metaphone'],
          },
        },
      },
    },
    mappings: {
      dynamic: 'strict',
      properties: {
        mark_text: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            phonetic: {
              type: 'text',
              analyzer: 'trademark_phonetic',
              search_analyzer: 'trademark_phonetic',
            },
          },
        },
        owner: { type: 'keyword' },
        jurisdiction: { type: 'keyword' },
        nice_classes: { type: 'integer' },
        status: { type: 'keyword' },
        filing_date: { type: 'date' },
        source_registry: { type: 'keyword' },
        similarity_vector: {
          type: 'dense_vector',
          dims: SIMILARITY_VECTOR_DIMS,
          index: false,
        },
      },
    },
  },
  [OFFICE_ACTIONS_INDEX]: {
    mappings: {
      dynamic: 'strict',
      properties: {
        reference_text: { type: 'text' },
        examiner_reasoning: { type: 'text' },
        related_classes: { type: 'integer' },
        related_marks: { type: 'keyword' },
      },
    },
  },
});

async function responseMessage(response) {
  const body = await response.text().catch(() => '');
  return body ? `: ${body}` : '';
}

async function ensureIndex({ baseUrl, indexName, definition, fetchImpl }) {
  const indexUrl = `${baseUrl}/${encodeURIComponent(indexName)}`;
  const existing = await fetchImpl(indexUrl, { method: 'HEAD' });
  if (existing.ok) return { name: indexName, created: false };
  if (existing.status !== 404) {
    throw new Error(
      `Elasticsearch index check for ${indexName} failed with HTTP ${existing.status}`
      + await responseMessage(existing),
    );
  }

  const created = await fetchImpl(indexUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition),
  });
  if (created.ok) return { name: indexName, created: true };

  const body = await created.text().catch(() => '');
  if (created.status === 400 && body.includes('resource_already_exists_exception')) {
    return { name: indexName, created: false };
  }
  throw new Error(
    `Elasticsearch index creation for ${indexName} failed with HTTP ${created.status}`
    + (body ? `: ${body}` : ''),
  );
}

export async function ensureElasticsearchIndices({
  baseUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!baseUrl?.trim()) throw new Error('ELASTICSEARCH_URL is required for index management.');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  const results = [];
  for (const [indexName, definition] of Object.entries(indexDefinitions)) {
    results.push(await ensureIndex({
      baseUrl: normalizedBaseUrl,
      indexName,
      definition,
      fetchImpl,
    }));
  }
  return results;
}
