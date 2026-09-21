import { ElasticsearchSearchSource } from './elasticsearch-search-source.js';
import { PostgresSearchSource } from './postgres-search-source.js';
import { FederatedSearchService } from './federated-search-service.js';
import { RiskEnrichedSearchService } from '../risk/risk-enriched-search-service.js';
import { createPool } from '../db/pool.js';

function configuredBackend() {
  const value = process.env.SEARCH_BACKEND?.trim().toLowerCase() || 'elasticsearch';
  if (!['elasticsearch', 'postgres'].includes(value)) {
    throw new Error('SEARCH_BACKEND must be elasticsearch or postgres.');
  }
  return value;
}

/**
 * Deep Trademark Search module. Registry adapters, federation, Risk Analysis,
 * and freshness policy are implementation details behind its search interface.
 */
export class TrademarkSearchService {
  constructor(config, {
    fetchImpl,
    logger,
    requestIdFactory,
    riskScorer,
    freshnessService = null,
    database = null,
  } = {}) {
    if (!config?.searchEnabled) throw new TypeError('TrademarkSearchService requires enabled search configuration.');

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

    this.searchSources = config.searchSourceRegistries.map((sourceName) => (
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

    this.federatedSearchService = new FederatedSearchService({
      sources: this.searchSources,
      ...(logger === undefined ? {} : { logger }),
      ...(requestIdFactory === undefined ? {} : { requestIdFactory }),
    });
    this.riskEnrichedSearchService = new RiskEnrichedSearchService({
      searchService: this.federatedSearchService,
      riskScorer,
    });
    this.freshnessService = freshnessService;
    this.searchDatabase = database ? null : searchDatabase;
  }

  async search(query, options = {}) {
    const freshness = this.freshnessService
      ? await this.freshnessService.assertSearchReady()
      : null;
    const result = await this.riskEnrichedSearchService.search(query, options);
    return freshness ? { ...result, dataFreshness: freshness } : result;
  }
}
