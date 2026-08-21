import { WatchQueueError, validateWatchJob } from './watch-ingest-queue.js';

const MAX_ATTEMPTS = 3;

function nowIso(clock) {
  const now = clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Watch clock must return a valid Date.');
  return now.toISOString();
}

function skipped(code) { return { outcome: 'skipped', code, retryable: false }; }

function searchQuery(mark) {
  return {
    mark: mark.markText,
    jurisdictions: [mark.jurisdiction],
    niceClasses: [...mark.niceClasses],
    status: null,
    owner: null,
    filedFrom: null,
    filedTo: null,
  };
}

export class WatchIngestProcessor {
  constructor({ repository, queue, searchService, clock = () => new Date() }) {
    if (!repository || typeof repository.loadForProcessing !== 'function' || typeof repository.recordPollOutcome !== 'function') {
      throw new TypeError('WatchIngestProcessor needs a watch repository.');
    }
    if (!queue || typeof queue.acquireProcessingLock !== 'function' || typeof queue.releaseProcessingLock !== 'function') {
      throw new TypeError('WatchIngestProcessor needs a watch queue.');
    }
    if (!searchService || typeof searchService.search !== 'function') {
      throw new TypeError('WatchIngestProcessor needs a risk-enriched search service.');
    }
    if (typeof clock !== 'function') throw new TypeError('WatchIngestProcessor needs a clock.');
    this.repository = repository;
    this.queue = queue;
    this.searchService = searchService;
    this.clock = clock;
  }

  async process(job) {
    let valid;
    try { valid = validateWatchJob(job); } catch { return skipped('WATCH_JOB_INVALID'); }
    let lockToken;
    try {
      lockToken = await this.queue.acquireProcessingLock(valid.jobId);
      if (!lockToken) return skipped('WATCH_JOB_DUPLICATE');
      let loaded;
      try {
        loaded = await this.repository.loadForProcessing({ firmId: valid.firmId, watchId: valid.watchId });
      } catch {
        return { outcome: 'failed', code: 'WATCH_DATABASE_UNAVAILABLE', retryable: valid.attempt < MAX_ATTEMPTS };
      }
      if (!loaded) return skipped('WATCH_NOT_FOUND');
      const { watch, portfolioMark } = loaded;
      if (watch.state !== 'enabled' || watch.firmId !== valid.firmId
        || watch.portfolioMarkId !== valid.portfolioMarkId || portfolioMark.id !== valid.portfolioMarkId
        || portfolioMark.firmId !== valid.firmId) return skipped('WATCH_STALE');

      try {
        const response = await this.searchService.search(searchQuery(portfolioMark));
        const pollStatus = response.partial ? 'partial' : 'completed';
        try {
          await this.repository.recordPollOutcome({
            firmId: valid.firmId, watchId: valid.watchId, polledAt: nowIso(this.clock),
            status: pollStatus, errorCode: null,
          });
        } catch {
          return { outcome: 'failed', code: 'WATCH_POLL_UPDATE_FAILED', retryable: valid.attempt < MAX_ATTEMPTS };
        }
        return {
          outcome: pollStatus, code: null, retryable: false,
          polling: {
            requestId: response.requestId, partial: response.partial === true,
            sourceStatuses: response.sourceStatuses, results: response.results,
          },
        };
      } catch {
        try {
          await this.repository.recordPollOutcome({
            firmId: valid.firmId, watchId: valid.watchId, polledAt: nowIso(this.clock),
            status: 'failed', errorCode: 'WATCH_SEARCH_FAILED',
          });
        } catch {
          return { outcome: 'failed', code: 'WATCH_POLL_UPDATE_FAILED', retryable: valid.attempt < MAX_ATTEMPTS };
        }
        return { outcome: 'failed', code: 'WATCH_SEARCH_FAILED', retryable: valid.attempt < MAX_ATTEMPTS };
      }
    } catch (error) {
      return {
        outcome: 'failed', code: error instanceof WatchQueueError ? error.code : 'WATCH_QUEUE_UNAVAILABLE',
        retryable: valid?.attempt < MAX_ATTEMPTS,
      };
    } finally {
      if (lockToken) {
        try { await this.queue.releaseProcessingLock(valid.jobId, lockToken); } catch {
          // A bounded Redis lock expiry prevents a leaked lock; there is no sensitive payload to log.
        }
      }
    }
  }
}
