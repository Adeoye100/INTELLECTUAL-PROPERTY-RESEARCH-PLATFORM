import { randomUUID } from 'node:crypto';
import { normalizeOfficeActionSourceResult } from './office-action-validation.js';

export class OfficeActionSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OfficeActionSourceError';
    this.code = code;
  }
}

function safeErrorName(error) {
  const name = typeof error?.name === 'string' ? error.name : 'Error';
  return /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(name) ? name : 'Error';
}

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  return /^[A-Z][A-Z0-9_]{0,99}$/.test(code) ? code : 'UNKNOWN';
}

function sourceOutputError() {
  return new OfficeActionSourceError(
    'OFFICE_ACTION_SOURCE_INVALID_OUTPUT',
    'Office Action source returned an invalid result.',
  );
}

function withTimeout(work, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new OfficeActionSourceError(
      'OFFICE_ACTION_SOURCE_TIMEOUT',
      'Office Action source timed out.',
    )), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(work), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Infrastructure-independent Office Action fan-out. Sources expose
 * `{ sourceName, searchOfficeActions(query) }` and are never constructed here.
 */
export class FederatedOfficeActionSearchService {
  constructor({ sources, sourceTimeoutMs = 3_000, requestIdFactory = randomUUID, logger } = {}) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new TypeError('FederatedOfficeActionSearchService requires at least one source.');
    }
    if (!Number.isSafeInteger(sourceTimeoutMs) || sourceTimeoutMs < 100 || sourceTimeoutMs > 60_000) {
      throw new TypeError('FederatedOfficeActionSearchService sourceTimeoutMs must be between 100 and 60000.');
    }
    if (typeof requestIdFactory !== 'function') {
      throw new TypeError('FederatedOfficeActionSearchService requires a requestIdFactory function.');
    }
    if (logger !== undefined && (logger === null || typeof logger.warn !== 'function')) {
      throw new TypeError('FederatedOfficeActionSearchService logger must provide a warn function.');
    }
    const names = new Set();
    this.sources = sources.map((source) => {
      if (!source || typeof source.sourceName !== 'string' || !source.sourceName.trim()) {
        throw new TypeError('Each Office Action source requires a sourceName.');
      }
      if (typeof source.searchOfficeActions !== 'function') {
        throw new TypeError(`Office Action source ${source.sourceName} requires searchOfficeActions.`);
      }
      const sourceName = source.sourceName.trim().toUpperCase();
      if (names.has(sourceName)) throw new TypeError(`Duplicate Office Action source: ${sourceName}.`);
      names.add(sourceName);
      return { sourceName, searchOfficeActions: source.searchOfficeActions };
    });
    this.sourceTimeoutMs = sourceTimeoutMs;
    this.requestIdFactory = requestIdFactory;
    this.logger = logger;
  }

  logUnavailable(source, error) {
    this.logger?.warn('Office Action search source unavailable', {
      source,
      name: safeErrorName(error),
      code: safeErrorCode(error),
    });
  }

  async searchOfficeActions(query) {
    const settled = await Promise.allSettled(this.sources.map((source) => withTimeout(
      () => source.searchOfficeActions(query), this.sourceTimeoutMs,
    )));
    const seen = new Set();
    const results = [];
    const sourceStatuses = settled.map((outcome, index) => {
      const source = this.sources[index];
      if (outcome.status !== 'fulfilled' || !Array.isArray(outcome.value)) {
        this.logUnavailable(source.sourceName, outcome.status === 'rejected' ? outcome.reason : sourceOutputError());
        return { source: source.sourceName, status: 'unavailable', resultCount: 0 };
      }
      try {
        const normalized = outcome.value.map((record) => normalizeOfficeActionSourceResult(record, source.sourceName));
        const unique = normalized.filter((record) => {
          const key = `${record.sourceRegistry}\u0000${record.sourceReferenceId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        results.push(...unique);
        return { source: source.sourceName, status: 'complete', resultCount: unique.length };
      } catch (error) {
        this.logUnavailable(source.sourceName, error);
        return { source: source.sourceName, status: 'unavailable', resultCount: 0 };
      }
    });
    return {
      results,
      sourceStatuses,
      partial: sourceStatuses.some((status) => status.status === 'unavailable'),
      requestId: this.requestIdFactory(),
    };
  }
}
