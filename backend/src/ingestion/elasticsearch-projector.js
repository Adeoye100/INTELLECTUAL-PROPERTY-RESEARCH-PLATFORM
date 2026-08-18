import { TRADEMARKS_COMPOSITE_INDEX } from '../search/elasticsearch-indices.js';

/**
 * @typedef {object} PostgresTrademarkRecord
 * @property {string} id
 * @property {string} mark_text
 * @property {string|null} [owner]
 * @property {string} jurisdiction
 * @property {number[]} nice_classes
 * @property {string} status
 * @property {string|Date|null} [filing_date]
 * @property {string} source_registry
 * @property {string} source_reference_id
 * @property {number[]} [similarity_vector]
 */

/** @param {PostgresTrademarkRecord} row */
export function toCompositeTrademarkDocument(row) {
  if (typeof row.source_reference_id !== 'string' || !row.source_reference_id.trim()) {
    throw new TypeError('A trademark projection requires a non-empty source_reference_id.');
  }

  const document = {
    mark_text: row.mark_text,
    owner: row.owner ?? null,
    jurisdiction: row.jurisdiction,
    nice_classes: row.nice_classes,
    status: row.status,
    filing_date: row.filing_date ?? null,
    source_registry: row.source_registry,
    source_reference_id: row.source_reference_id,
  };
  if (row.similarity_vector !== undefined) {
    document.similarity_vector = row.similarity_vector;
  }
  return document;
}

export class ElasticsearchProjector {
  constructor({
    baseUrl,
    indexName = TRADEMARKS_COMPOSITE_INDEX,
    fetchImpl = globalThis.fetch,
  }) {
    if (!baseUrl?.trim()) throw new Error('ELASTICSEARCH_URL is required for projection.');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.indexName = indexName;
    this.fetchImpl = fetchImpl;
  }

  async project(rows) {
    if (!rows.length) return;
    const operations = rows.flatMap((row) => [
      JSON.stringify({ index: { _index: this.indexName, _id: row.id } }),
      JSON.stringify(toCompositeTrademarkDocument(row)),
    ]).join('\n') + '\n';

    const response = await this.fetchImpl(`${this.baseUrl}/_bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: operations,
    });
    if (!response.ok) {
      throw new Error(`Elasticsearch bulk projection failed with HTTP ${response.status}.`);
    }
    const result = await response.json();
    if (result.errors) {
      const failures = result.items?.filter((item) => item.index?.error).length ?? 'unknown';
      throw new Error(`Elasticsearch bulk projection reported ${failures} failed document(s).`);
    }
  }
}

/**
 * Projects one PostgreSQL-shaped trademark or portfolio-mark row through the
 * same bulk transport used by the BE-07/08 sync pipeline.
 *
 * @param {PostgresTrademarkRecord} record
 * @param {{baseUrl?: string, indexName?: string, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<void>}
 */
export async function projectToElasticsearch(record, options = {}) {
  const projector = new ElasticsearchProjector({
    baseUrl: options.baseUrl ?? process.env.ELASTICSEARCH_URL,
    indexName: options.indexName,
    fetchImpl: options.fetchImpl,
  });
  await projector.project([record]);
}

export async function syncRegistryTrademarksToElasticsearch({
  repository,
  projector,
  batchSize = 500,
}) {
  let projected = 0;
  while (true) {
    const rows = await repository.pendingProjection(batchSize);
    if (!rows.length) return { projected };
    await projector.project(rows);
    await repository.markProjected(rows);
    projected += rows.length;
  }
}
