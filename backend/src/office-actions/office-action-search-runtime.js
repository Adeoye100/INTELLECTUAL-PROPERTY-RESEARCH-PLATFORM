import { FederatedOfficeActionSearchService } from './federated-office-action-search-service.js';

/**
 * Creates an Office Action search service only from explicitly injected source
 * adapters. No production adapter is fabricated and construction never calls a
 * source, so enabling the configuration alone cannot create registry traffic.
 */
export function createOfficeActionSearchRuntime(config, {
  sources = [],
  logger,
  requestIdFactory,
} = {}) {
  if (!config?.officeActionSearchEnabled) {
    return { officeActionSources: [], federatedOfficeActionSearchService: null, officeActionSearchService: null };
  }
  if (!Array.isArray(sources)) throw new TypeError('Office Action sources must be an array.');
  const configured = new Set(config.officeActionSourceRegistries);
  const selected = sources.filter((source) => {
    const name = typeof source?.sourceName === 'string' ? source.sourceName.trim().toUpperCase() : null;
    return name !== null && configured.has(name);
  });
  if (selected.length === 0) {
    return { officeActionSources: [], federatedOfficeActionSearchService: null, officeActionSearchService: null };
  }
  const federatedOfficeActionSearchService = new FederatedOfficeActionSearchService({
    sources: selected,
    sourceTimeoutMs: config.officeActionSourceTimeoutMs,
    ...(logger === undefined ? {} : { logger }),
    ...(requestIdFactory === undefined ? {} : { requestIdFactory }),
  });
  return {
    officeActionSources: selected,
    federatedOfficeActionSearchService,
    officeActionSearchService: federatedOfficeActionSearchService,
  };
}
