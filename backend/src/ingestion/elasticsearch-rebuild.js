import {
  ensureElasticsearchIndex,
  indexDefinitions,
  TRADEMARKS_COMPOSITE_INDEX,
} from '../search/elasticsearch-indices.js';
import {
  ElasticsearchProjector,
  syncRegistryTrademarksToElasticsearch,
} from './elasticsearch-projector.js';
import { ACTIVE_USPTO_STATUSES } from './uspto-corpus-maintenance.js';

export async function rebuildRegistryTrademarksInElasticsearch({
  repository,
  baseUrl,
  indexName,
  batchSize = 500,
  fetchImpl = globalThis.fetch,
}) {
  const index = await ensureElasticsearchIndex({
    baseUrl,
    indexName,
    definition: indexDefinitions[TRADEMARKS_COMPOSITE_INDEX],
    fetchImpl,
  });
  if (!index.created) {
    throw new Error(`Elasticsearch rebuild target ${indexName} already exists; choose a new index name.`);
  }

  const projector = new ElasticsearchProjector({ baseUrl, indexName, fetchImpl });
  const result = await syncRegistryTrademarksToElasticsearch({
    repository,
    projector,
    batchSize,
    full: true,
    fullStatuses: ACTIVE_USPTO_STATUSES,
    fullSourceRegistry: 'USPTO',
    fullOrderById: true,
  });
  return { indexName, created: true, ...result };
}
