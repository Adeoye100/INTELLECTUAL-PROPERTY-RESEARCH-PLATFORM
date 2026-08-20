import { ElasticsearchSearchSource } from './elasticsearch-search-source.js';
import { FederatedSearchService } from './federated-search-service.js';
import { RiskEnrichedSearchService } from '../risk/risk-enriched-search-service.js';

/** Creates the optional, feature-gated Elasticsearch-backed search runtime. */
export function createSearchRuntime(config, {
  fetchImpl,
  logger,
  requestIdFactory,
  riskScorer,
} = {}) {
  if (!config?.searchEnabled) {
    return { searchSources: [], federatedSearchService: null, searchService: null };
  }

  const searchSources = config.searchSourceRegistries.map((sourceName) => new ElasticsearchSearchSource({
    sourceName,
    baseUrl: config.elasticsearchUrl,
    timeoutMs: config.searchSourceTimeoutMs,
    maxResults: config.searchMaxResults,
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  }));
  const federatedSearchService = new FederatedSearchService({
    sources: searchSources,
    ...(logger === undefined ? {} : { logger }),
    ...(requestIdFactory === undefined ? {} : { requestIdFactory }),
  });
  const searchService = new RiskEnrichedSearchService({
    searchService: federatedSearchService,
    riskScorer,
  });

  return { searchSources, federatedSearchService, searchService };
}
