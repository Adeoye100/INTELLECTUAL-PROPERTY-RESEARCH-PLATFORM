import { deterministicPdfExportJobId } from './pdf-export-queue.js';

function now(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('clock');
  return date.toISOString();
}

function result(outcome, code = null, retryable = false) {
  return { outcome, code, retryable };
}

/**
 * Owns durable PDF export state transitions. Rendering and source loading stay
 * outside this module; the worker crosses this seam with lifecycle outcomes.
 */
export class PdfExportLifecycle {
  constructor({ repository, queue, exportAuditService, exportService, clock = () => new Date(), maxAttempts = 3 }) {
    const repositoryMethods = ['withTransaction', 'claimQueued', 'findByIdForFirm', 'complete', 'requeue'];
    if (!repository || repositoryMethods.some((method) => typeof repository[method] !== 'function')) {
      throw new TypeError('PdfExportLifecycle needs an export repository.');
    }
    if (!queue || ['enqueue'].some((method) => typeof queue[method] !== 'function')) {
      throw new TypeError('PdfExportLifecycle needs an export queue.');
    }
    if (!exportAuditService || typeof exportAuditService.completed !== 'function') {
      throw new TypeError('PdfExportLifecycle needs an export audit service.');
    }
    if (!exportService || typeof exportService.markFailed !== 'function') {
      throw new TypeError('PdfExportLifecycle needs an export failure handler.');
    }
    if (typeof clock !== 'function' || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new TypeError('PdfExportLifecycle needs valid runtime dependencies.');
    }
    this.repository = repository;
    this.queue = queue;
    this.exportAuditService = exportAuditService;
    this.exportService = exportService;
    this.clock = clock;
    this.maxAttempts = maxAttempts;
  }

  async claim(job) {
    return this.repository.withTransaction((transaction) => this.repository.claimQueued({
      transaction,
      firmId: job.firmId,
      exportId: job.exportId,
      processingStartedAt: now(this.clock),
    }));
  }

  async find(job) {
    return this.repository.findByIdForFirm({ firmId: job.firmId, exportId: job.exportId });
  }

  async complete(record, { storageKey, byteSize, checksumSha256 }) {
    return this.repository.withTransaction(async (transaction) => {
      const completed = await this.repository.complete({
        transaction,
        firmId: record.firmId,
        exportId: record.id,
        storageKey,
        byteSize,
        checksumSha256,
        completedAt: now(this.clock),
      });
      if (!completed) throw Object.assign(new Error('stale'), { code: 'EXPORT_STATE_STALE' });
      try {
        await this.exportAuditService.completed({
          transaction,
          firmId: record.firmId,
          actorUserId: record.requestedByActorUserId,
          exportId: record.id,
          exportType: record.type,
          outputFormat: 'pdf',
          filterSummary: { sourceType: record.type },
          byteSize,
          checksumSha256,
        });
      } catch (error) {
        const failure = error instanceof Error ? error : new Error('Export audit write failed.');
        failure.code = 'EXPORT_AUDIT_WRITE_FAILED';
        throw failure;
      }
      return completed;
    });
  }

  async retry(record, job, code) {
    if (job.attempt + 1 >= this.maxAttempts) return this.fail(record, code, job);
    const base = this.clock();
    const baseDate = base instanceof Date ? base : new Date(base);
    const scheduledFor = new Date(baseDate.getTime() + (1_000 * (2 ** job.attempt))).toISOString();
    try {
      const requeued = await this.repository.withTransaction((transaction) => this.repository.requeue({
        transaction,
        firmId: record.firmId,
        exportId: record.id,
        updatedAt: scheduledFor,
      }));
      if (!requeued) return result('skipped', 'EXPORT_STATE_STALE');
      const next = {
        version: 1,
        exportId: record.id,
        firmId: record.firmId,
        scheduledFor,
        attempt: job.attempt + 1,
      };
      next.jobId = deterministicPdfExportJobId(next.exportId, next.scheduledFor, next.attempt);
      await this.queue.enqueue(next);
      return result('retrying', code, true);
    } catch {
      return result('failed', 'EXPORT_QUEUE_UNAVAILABLE', false);
    }
  }

  async fail(record, code, job) {
    try {
      const failed = await this.exportService.markFailed({ record, failureCode: code });
      return failed ? result('failed', code, false) : result('skipped', 'EXPORT_STATE_STALE');
    } catch {
      // An audit/database outage leaves the claim in processing. Requeue a
      // bounded retry so a successful failure audit is not silently skipped.
      return job.attempt + 1 < this.maxAttempts
        ? result('failed', 'EXPORT_AUDIT_WRITE_FAILED', true)
        : result('failed', 'EXPORT_AUDIT_WRITE_FAILED', false);
    }
  }
}
