import { randomUUID } from 'node:crypto';

function safeErrorName(error) {
  const name = typeof error?.name === 'string' ? error.name : 'Error';
  return /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(name) ? name : 'Error';
}

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  return /^[A-Z][A-Z0-9_]{0,99}$/.test(code) ? code : 'UNKNOWN';
}

function invalidProviderOutputError() {
  const error = new TypeError('A federated search source must resolve to an array.');
  error.name = 'ProviderOutputError';
  error.code = 'FEDERATED_PROVIDER_INVALID_OUTPUT';
  return error;
}

/**
 * Infrastructure-independent orchestration for registry search providers.
 * A source has the shape `{ sourceName: string, search: async (query) => [] }`.
 */
export class FederatedSearchService {
  constructor({ sources, requestIdFactory = randomUUID, logger } = {}) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new TypeError('FederatedSearchService requires at least one source.');
    }
    if (typeof requestIdFactory !== 'function') {
      throw new TypeError('FederatedSearchService requires a requestIdFactory function.');
    }
    if (logger !== undefined && (logger === null || typeof logger.warn !== 'function')) {
      throw new TypeError('FederatedSearchService logger must provide a warn function.');
    }

    const sourceNames = new Set();
    this.sources = sources.map((source) => {
      if (!source || typeof source.sourceName !== 'string' || !source.sourceName.trim()) {
        throw new TypeError('Each federated search source requires a sourceName.');
      }
      if (typeof source.search !== 'function') {
        throw new TypeError(`Federated search source ${source.sourceName} requires a search function.`);
      }
      const sourceName = source.sourceName.trim();
      if (sourceNames.has(sourceName)) {
        throw new TypeError(`Duplicate federated search source: ${sourceName}.`);
      }
      sourceNames.add(sourceName);
      return { sourceName, search: source.search };
    });
    this.requestIdFactory = requestIdFactory;
    this.logger = logger;
  }

  logUnavailable(sourceName, error) {
    this.logger?.warn('Federated search source unavailable', {
      source: sourceName,
      name: safeErrorName(error),
      code: safeErrorCode(error),
    });
  }

  async search(query) {
    const settled = await Promise.allSettled(
      this.sources.map((source) => Promise.resolve().then(() => source.search(query))),
    );

    const results = [];
    const sourceStatuses = settled.map((outcome, index) => {
      const { sourceName } = this.sources[index];
      if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
        // Records are passed through untouched, retaining registry attribution
        // supplied by the provider and their provider-defined ordering.
        results.push(...outcome.value);
        return { source: sourceName, status: 'complete', resultCount: outcome.value.length };
      }

      const error = outcome.status === 'rejected' ? outcome.reason : invalidProviderOutputError();
      this.logUnavailable(sourceName, error);
      return { source: sourceName, status: 'unavailable', resultCount: 0 };
    });

    return {
      results,
      sourceStatuses,
      partial: sourceStatuses.some(({ status }) => status === 'unavailable'),
      requestId: this.requestIdFactory(),
    };
  }
}
