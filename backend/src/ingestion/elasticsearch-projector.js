export class ElasticsearchProjector {
  constructor({ baseUrl, indexName = 'trademarks_composite', fetchImpl = globalThis.fetch }) {
    if (!baseUrl?.trim()) throw new Error('ELASTICSEARCH_URL is required for projection.');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.indexName = indexName;
    this.fetchImpl = fetchImpl;
  }

  async project(rows) {
    if (!rows.length) return;
    const operations = rows.flatMap((row) => [
      JSON.stringify({ index: { _index: this.indexName, _id: row.id } }),
      JSON.stringify({
        mark_text: row.mark_text,
        owner: row.owner,
        jurisdiction: row.jurisdiction,
        nice_classes: row.nice_classes,
        status: row.status,
        filing_date: row.filing_date,
        source_registry: row.source_registry,
      }),
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
