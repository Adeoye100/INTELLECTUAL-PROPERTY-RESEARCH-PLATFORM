import { ElasticsearchSearchSource } from './elasticsearch-search-source.js';
import { FederatedSearchService } from './federated-search-service.js';

/** Creates the optional, feature-gated Elasticsearch-backed search runtime. */
export function createSearchRuntime(config, {
  fetchImpl,
  logger,
  requestIdFactory,
} = {}) {
  if (!config?.searchEnabled) {
    return { searchSources: [], searchService: null };
  }

  const searchSources = config.searchSourceRegistries.map((sourceName) => new ElasticsearchSearchSource({
    sourceName,
    baseUrl: config.elasticsearchUrl,
    timeoutMs: config.searchSourceTimeoutMs,
    maxResults: config.searchMaxResults,
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  }));
  const searchService = new FederatedSearchService({
    sources: searchSources,
    ...(logger === undefined ? {} : { logger }),
    ...(requestIdFactory === undefined ? {} : { requestIdFactory }),
  });

  return { searchSources, searchService };
}
