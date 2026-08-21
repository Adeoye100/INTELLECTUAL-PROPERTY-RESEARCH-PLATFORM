import { deterministicWatchJobId, WatchQueueError } from './watch-ingest-queue.js';

function validClock(clock) {
  const now = clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Watch clock must return a valid Date.');
  return now;
}

function failureCode(error) {
  return error instanceof WatchQueueError ? error.code : 'WATCH_SCHEDULER_DATABASE_FAILED';
}

export class WatchScheduler {
  constructor({ repository, queue, clock = () => new Date(), batchSize = 50 }) {
    if (!repository || typeof repository.withDueWatchBatch !== 'function') {
      throw new TypeError('WatchScheduler needs a due-watch repository.');
    }
    if (!queue || typeof queue.enqueue !== 'function') throw new TypeError('WatchScheduler needs a watch queue.');
    if (typeof clock !== 'function' || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      throw new TypeError('WatchScheduler needs a clock and a bounded batch size.');
    }
    this.repository = repository;
    this.queue = queue;
    this.clock = clock;
    this.batchSize = batchSize;
  }

  async runOnce() {
    const now = validClock(this.clock);
    const summary = { selected: 0, enqueued: 0, deduplicated: 0, advanced: 0, failures: [] };
    try {
      const selected = await this.repository.withDueWatchBatch({
        now: now.toISOString(), limit: this.batchSize,
        handleWatch: async (watch) => {
          const scheduledFor = watch.nextPollAt;
          const job = {
            version: 1,
            jobId: deterministicWatchJobId(watch.id, scheduledFor),
            watchId: watch.id,
            firmId: watch.firmId,
            portfolioMarkId: watch.portfolioMarkId,
            scheduledFor,
            attempt: 0,
          };
          try {
            const queued = await this.queue.enqueue(job);
            if (queued.enqueued) summary.enqueued += 1;
            if (queued.deduplicated) summary.deduplicated += 1;
            summary.advanced += 1;
            return {
              advance: true,
              nextPollAt: new Date(Date.parse(scheduledFor) + (watch.pollIntervalMinutes * 60_000)).toISOString(),
            };
          } catch (error) {
            summary.failures.push(failureCode(error));
            return { advance: false };
          }
        },
      });
      summary.selected = selected.selected;
    } catch (error) {
      summary.failures.push(failureCode(error));
    }
    return summary;
  }
}
