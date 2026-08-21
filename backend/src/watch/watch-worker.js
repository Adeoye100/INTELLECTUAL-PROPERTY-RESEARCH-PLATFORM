import { WatchQueueError } from './watch-ingest-queue.js';

export class WatchWorker {
  constructor({ scheduler, queue, processor, intervalMs, maxJobsPerTick }) {
    if (!scheduler || typeof scheduler.runOnce !== 'function' || !queue || typeof queue.dequeue !== 'function'
      || !processor || typeof processor.process !== 'function') throw new TypeError('WatchWorker needs scheduler, queue, and processor.');
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || !Number.isSafeInteger(maxJobsPerTick) || maxJobsPerTick < 1) {
      throw new TypeError('WatchWorker needs positive interval and job bounds.');
    }
    this.scheduler = scheduler;
    this.queue = queue;
    this.processor = processor;
    this.intervalMs = intervalMs;
    this.maxJobsPerTick = maxJobsPerTick;
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
        outcomes.push(await this.processor.process(job));
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
