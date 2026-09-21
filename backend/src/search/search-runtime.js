import { TrademarkSearchService } from './trademark-search-service.js';

/** Creates the optional, feature-gated registry search runtime. */
export function createSearchRuntime(config, {
  fetchImpl,
  logger,
  requestIdFactory,
  riskScorer,
  freshnessService = null,
  database = null,
} = {}) {
  if (!config?.searchEnabled) {
    return { searchSources: [], federatedSearchService: null, searchService: null };
  }

  const searchService = new TrademarkSearchService(config, {
    fetchImpl,
    logger,
    requestIdFactory,
    riskScorer,
    freshnessService,
    database,
  });

  return {
    searchSources: searchService.searchSources,
    federatedSearchService: searchService.federatedSearchService,
    searchService,
    searchDatabase: searchService.searchDatabase,
  };
}
