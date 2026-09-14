import { AppError } from '../errors.js';

function configuredFreshnessMode() {
  const value = process.env.SEARCH_FRESHNESS_MODE?.trim().toLowerCase() || 'refresh-ledger';
  if (!['refresh-ledger', 'corpus'].includes(value)) {
    throw new Error('SEARCH_FRESHNESS_MODE must be refresh-ledger or corpus.');
  }
  return value;
}

export class SearchFreshnessService {
  constructor({
    repository,
    expectedIntervalHours = 24,
    maxMissedRefreshRuns = 2,
    clock = () => new Date(),
  }) {
    if (!repository || typeof repository.latestCompleteRun !== 'function' || typeof repository.latestRun !== 'function') {
      throw new TypeError('SearchFreshnessService needs a refresh repository.');
    }
    const interval = Number(expectedIntervalHours);
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > 168) {
      throw new TypeError('expectedIntervalHours must be an integer between 1 and 168.');
    }
    const missed = Number(maxMissedRefreshRuns);
    if (!Number.isSafeInteger(missed) || missed < 1 || missed > 7) {
      throw new TypeError('maxMissedRefreshRuns must be an integer between 1 and 7.');
    }
    this.repository = repository;
    this.expectedIntervalHours = interval;
    this.maxMissedRefreshRuns = missed;
    this.maxAllowedAgeMs = interval * missed * 3600 * 1000;
    this.clock = clock;
  }

  async getSearchFreshness(sourceRegistry = 'USPTO') {
    if (configuredFreshnessMode() === 'corpus') {
      if (typeof this.repository.corpusSummary !== 'function') {
        throw new Error('SEARCH_FRESHNESS_MODE=corpus requires repository.corpusSummary().');
      }
      const [corpus, latestComplete] = await Promise.all([
        this.repository.corpusSummary(sourceRegistry),
        this.repository.latestCompleteRun(sourceRegistry),
      ]);
      const recordCount = Number(corpus.recordCount ?? 0);
      const hasCompleteImport = Boolean(latestComplete?.id && latestComplete?.completedAt);
      if (!Number.isFinite(recordCount) || recordCount <= 0 || !hasCompleteImport) {
        return {
          source: sourceRegistry,
          status: 'stale',
          dataThrough: latestComplete?.dataThroughDate ?? corpus.dataThroughDate ?? null,
          indexedAt: latestComplete?.completedAt ?? corpus.indexedAt ?? null,
          refreshRunId: latestComplete?.id ?? null,
          refreshing: false,
          sourceMode: 'persisted-bulk-corpus',
          recordCount,
          corpusComplete: hasCompleteImport,
        };
      }
      return {
        source: sourceRegistry,
        status: 'ready',
        dataThrough: latestComplete.dataThroughDate ?? corpus.dataThroughDate ?? null,
        indexedAt: latestComplete.completedAt ?? corpus.indexedAt ?? null,
        refreshRunId: latestComplete.id,
        refreshing: false,
        sourceMode: 'persisted-bulk-corpus',
        recordCount,
        corpusComplete: true,
      };
    }

    const now = this.clock();
    const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

    const [latestRun, latestComplete] = await Promise.all([
      this.repository.latestRun(sourceRegistry),
      this.repository.latestCompleteRun(sourceRegistry),
    ]);

    if (!latestComplete || !latestComplete.completedAt) {
      return {
        source: sourceRegistry,
        status: 'stale',
        dataThrough: null,
        indexedAt: null,
        refreshRunId: null,
        refreshing: false,
      };
    }

    const completedTime = new Date(latestComplete.completedAt).getTime();
    const ageMs = currentTime - completedTime;

    if (ageMs > this.maxAllowedAgeMs) {
      return {
        source: sourceRegistry,
        status: 'stale',
        dataThrough: latestComplete.dataThroughDate,
        indexedAt: latestComplete.completedAt,
        refreshRunId: latestComplete.id,
        refreshing: false,
      };
    }

    let status = 'ready';
    let refreshing = false;

    if (latestRun && (latestRun.status === 'running' || latestRun.status === 'ingested')) {
      status = 'refreshing';
      refreshing = true;
    } else if (latestRun && latestRun.status === 'failed') {
      status = 'degraded';
    }

    return {
      source: sourceRegistry,
      status,
      dataThrough: latestComplete.dataThroughDate,
      indexedAt: latestComplete.completedAt,
      refreshRunId: latestComplete.id,
      refreshing,
    };
  }

  async assertSearchReady(sourceRegistry = 'USPTO') {
    const freshness = await this.getSearchFreshness(sourceRegistry);
    if (freshness.status === 'stale') {
      const corpusMode = configuredFreshnessMode() === 'corpus';
      throw new AppError(
        503,
        corpusMode ? 'SEARCH_CORPUS_UNAVAILABLE' : 'SEARCH_DATA_STALE',
        corpusMode
          ? 'USPTO registry search is temporarily unavailable until a verified bulk corpus import completes.'
          : 'Trademark search is temporarily unavailable while registry data is refreshed.',
      );
    }
    return freshness;
  }
}
