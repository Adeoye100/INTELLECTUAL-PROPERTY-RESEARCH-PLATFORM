import { ElasticsearchSearchSource } from './elasticsearch-search-source.js';
import { PostgresSearchSource } from './postgres-search-source.js';
import { FederatedSearchService } from './federated-search-service.js';
import { RiskEnrichedSearchService } from '../risk/risk-enriched-search-service.js';
import { FreshnessGuardedSearchService } from './freshness-guarded-search-service.js';
import { createPool } from '../db/pool.js';

function configuredBackend() {
  const value = process.env.SEARCH_BACKEND?.trim().toLowerCase() || 'elasticsearch';
  if (!['elasticsearch', 'postgres'].includes(value)) {
    throw new Error('SEARCH_BACKEND must be elasticsearch or postgres.');
  }
  return value;
}

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

  const backend = configuredBackend();
  let searchDatabase = database;
  if (backend === 'postgres' && !searchDatabase) {
    searchDatabase = createPool(config.databaseUrl, {
      ...config,
      databasePoolMax: Math.min(config.databasePoolMax ?? 3, 3),
      databaseIdleTimeoutMs: Math.min(config.databaseIdleTimeoutMs ?? 5_000, 5_000),
    });
    searchDatabase.on?.('error', (error) => {
      logger?.warn?.('PostgreSQL search pool error', { name: error.name, code: error.code ?? 'UNKNOWN' });
    });
  }

  const searchSources = config.searchSourceRegistries.map((sourceName) => (
    backend === 'postgres'
      ? new PostgresSearchSource({
        sourceName,
        database: searchDatabase,
        maxResults: config.searchMaxResults,
      })
      : new ElasticsearchSearchSource({
        sourceName,
        baseUrl: config.elasticsearchUrl,
        timeoutMs: config.searchSourceTimeoutMs,
        maxResults: config.searchMaxResults,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      })
  ));

  const federatedSearchService = new FederatedSearchService({
    sources: searchSources,
    ...(logger === undefined ? {} : { logger }),
    ...(requestIdFactory === undefined ? {} : { requestIdFactory }),
  });
  const riskEnrichedSearchService = new RiskEnrichedSearchService({
    searchService: federatedSearchService,
    riskScorer,
  });

  const searchService = freshnessService
    ? new FreshnessGuardedSearchService({
      searchService: riskEnrichedSearchService,
      freshnessService,
    })
    : riskEnrichedSearchService;

  return { searchSources, federatedSearchService, searchService, searchDatabase: database ? null : searchDatabase };
}
