import { deterministicWatchJobId, WATCH_MAX_ATTEMPTS, WatchQueueError } from './watch-ingest-queue.js';

function retryJob(job, clock) {
  const now = clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Watch clock must return a valid Date.');
  const scheduledFor = new Date(now.getTime() + (1_000 * (2 ** job.attempt))).toISOString();
  const retry = {
    version: 1, watchId: job.watchId, firmId: job.firmId, portfolioMarkId: job.portfolioMarkId,
    scheduledFor, attempt: job.attempt + 1,
  };
  retry.jobId = deterministicWatchJobId(retry.watchId, retry.scheduledFor);
  return retry;
}

export class WatchWorker {
  constructor({ scheduler, queue, processor, intervalMs, maxJobsPerTick, clock = () => new Date() }) {
    if (!scheduler || typeof scheduler.runOnce !== 'function' || !queue || typeof queue.dequeue !== 'function'
      || typeof queue.enqueue !== 'function' || !processor || typeof processor.process !== 'function') {
      throw new TypeError('WatchWorker needs scheduler, queue, and processor.');
    }
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || !Number.isSafeInteger(maxJobsPerTick) || maxJobsPerTick < 1) {
      throw new TypeError('WatchWorker needs positive interval and job bounds.');
    }
    if (typeof clock !== 'function') throw new TypeError('WatchWorker needs a clock.');
    this.scheduler = scheduler;
    this.queue = queue;
    this.processor = processor;
    this.intervalMs = intervalMs;
    this.maxJobsPerTick = maxJobsPerTick;
    this.clock = clock;
    this.accepting = false;
    this.running = null;
    this.timer = null;
  }

  async runOnce() {
    if (!this.accepting || this.running) return { skipped: true };
    this.running = (async () => {
      const scheduling = await this.scheduler.runOnce();
      const outcomes = [];
      for (let index = 0; index < this.maxJobsPerTick && this.accepting; index += 1) {
        let job;
        try { job = await this.queue.dequeue(); } catch (error) {
          outcomes.push({ outcome: 'failed', code: error instanceof WatchQueueError ? error.code : 'WATCH_QUEUE_UNAVAILABLE' });
          break;
        }
        if (!job) break;
        const outcome = await this.processor.process(job);
        if (outcome.retryable === true && job.attempt + 1 < WATCH_MAX_ATTEMPTS) {
          try {
            await this.queue.enqueue(retryJob(job, this.clock));
            outcomes.push({ ...outcome, retryScheduled: true });
          } catch {
            outcomes.push({ outcome: 'failed', code: 'WATCH_RETRY_QUEUE_UNAVAILABLE', retryable: false });
          }
        } else outcomes.push(outcome);
      }
      return { scheduling, outcomes };
    })();
    try { return await this.running; } finally { this.running = null; }
  }

  start() {
    if (this.accepting) return;
    this.accepting = true;
    this.timer = setInterval(() => { this.runOnce().catch(() => {}); }, this.intervalMs);
    this.runOnce().catch(() => {});
  }

  async stop() {
    this.accepting = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }
}
