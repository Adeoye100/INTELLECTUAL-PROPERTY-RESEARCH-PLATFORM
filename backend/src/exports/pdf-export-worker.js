import { PdfExportQueueError } from './pdf-export-queue.js';

function safeJobRef(job) {
  return {
    jobId: typeof job?.jobId === 'string' ? job.jobId : null,
    exportId: typeof job?.exportId === 'string' ? job.exportId : null,
    attempt: Number.isSafeInteger(job?.attempt) ? job.attempt : null,
  };
}

export class PdfExportWorker {
  constructor({ queue, processor, intervalMs = 1_000, maxJobsPerTick = 5, logger = console }) {
    if (!queue || typeof queue.dequeue !== 'function' || !processor || typeof processor.process !== 'function') throw new TypeError('PdfExportWorker needs a queue and processor.');
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 100 || !Number.isSafeInteger(maxJobsPerTick) || maxJobsPerTick < 1 || maxJobsPerTick > 100) {
      throw new TypeError('PdfExportWorker needs bounded scheduling configuration.');
    }
    if (!logger || typeof logger.warn !== 'function' || typeof logger.error !== 'function') throw new TypeError('PdfExportWorker needs a safe logger.');
    this.queue = queue; this.processor = processor; this.intervalMs = intervalMs; this.maxJobsPerTick = maxJobsPerTick; this.logger = logger;
    this.accepting = false; this.running = null; this.timer = null;
  }
  async runOnce() {
    if (!this.accepting || this.running) return { skipped: true };
    this.running = (async () => {
      const outcomes = [];
      for (let index = 0; index < this.maxJobsPerTick && this.accepting; index += 1) {
        let job;
        try {
          job = await this.queue.dequeue();
        } catch (error) {
          const outcome = { outcome: 'failed', code: error instanceof PdfExportQueueError ? error.code : 'EXPORT_QUEUE_UNAVAILABLE' };
          outcomes.push(outcome);
          this.logger.error('PDF export queue dequeue failed', { code: outcome.code });
          break;
        }
        if (!job) break;
        const outcome = await this.processor.process(job);
        outcomes.push(outcome);
        if (outcome?.outcome === 'failed' || outcome?.outcome === 'retrying') {
          this.logger.warn('PDF export job did not complete', {
            ...safeJobRef(job),
            outcome: outcome.outcome,
            code: typeof outcome.code === 'string' ? outcome.code : 'EXPORT_PROCESSING_FAILED',
            retryable: outcome.retryable === true,
          });
        }
      }
      return { outcomes };
    })();
    try { return await this.running; } finally { this.running = null; }
  }
  start() { if (this.accepting) return; this.accepting = true; this.timer = setInterval(() => { this.runOnce().catch(() => {}); }, this.intervalMs); this.runOnce().catch(() => {}); }
  async stop() { this.accepting = false; if (this.timer) clearInterval(this.timer); this.timer = null; await this.running; }
}
