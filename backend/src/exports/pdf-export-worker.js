import { PdfExportQueueError } from './pdf-export-queue.js';

export class PdfExportWorker {
  constructor({ queue, processor, intervalMs = 1_000, maxJobsPerTick = 5 }) {
    if (!queue || typeof queue.dequeue !== 'function' || !processor || typeof processor.process !== 'function') throw new TypeError('PdfExportWorker needs a queue and processor.');
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 100 || !Number.isSafeInteger(maxJobsPerTick) || maxJobsPerTick < 1 || maxJobsPerTick > 100) {
      throw new TypeError('PdfExportWorker needs bounded scheduling configuration.');
    }
    this.queue = queue; this.processor = processor; this.intervalMs = intervalMs; this.maxJobsPerTick = maxJobsPerTick;
    this.accepting = false; this.running = null; this.timer = null;
  }
  async runOnce() {
    if (!this.accepting || this.running) return { skipped: true };
    this.running = (async () => {
      const outcomes = [];
      for (let index = 0; index < this.maxJobsPerTick && this.accepting; index += 1) {
        let job;
        try { job = await this.queue.dequeue(); } catch (error) {
          outcomes.push({ outcome: 'failed', code: error instanceof PdfExportQueueError ? error.code : 'EXPORT_QUEUE_UNAVAILABLE' }); break;
        }
        if (!job) break;
        outcomes.push(await this.processor.process(job));
      }
      return { outcomes };
    })();
    try { return await this.running; } finally { this.running = null; }
  }
  start() { if (this.accepting) return; this.accepting = true; this.timer = setInterval(() => { this.runOnce().catch(() => {}); }, this.intervalMs); this.runOnce().catch(() => {}); }
  async stop() { this.accepting = false; if (this.timer) clearInterval(this.timer); this.timer = null; await this.running; }
}
