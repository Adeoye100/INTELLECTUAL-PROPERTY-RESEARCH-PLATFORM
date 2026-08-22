import { createExportDocumentModel } from './export-document-model.js';
import { PdfExportQueueError, deterministicPdfExportJobId, validatePdfExportJob } from './pdf-export-queue.js';
import { exportStorageKey, sha256 } from './export-storage.js';

function now(clock) {
  const value = clock(); const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('clock');
  return date.toISOString();
}
function result(outcome, code = null, retryable = false) { return { outcome, code, retryable }; }
function stableFailure(error) {
  const code = error?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) return code;
  return 'EXPORT_PROCESSING_FAILED';
}
function terminal(code) {
  return ['EXPORT_SOURCE_NOT_FOUND', 'EXPORT_RENDER_INVALID', 'EXPORT_REQUEST_INVALID', 'EXPORT_JOB_INVALID'].includes(code);
}

export class PdfExportProcessor {
  constructor({ repository, queue, sourceLoader, renderer, storage, exportAuditService, exportService, clock = () => new Date(), maxAttempts = 3 }) {
    const repositoryMethods = ['withTransaction', 'claimQueued', 'findByIdForFirm', 'complete', 'requeue'];
    if (!repository || repositoryMethods.some((method) => typeof repository[method] !== 'function')) throw new TypeError('PdfExportProcessor needs an export repository.');
    if (!queue || ['acquireProcessingLock', 'releaseProcessingLock', 'enqueue'].some((method) => typeof queue[method] !== 'function')) throw new TypeError('PdfExportProcessor needs an export queue.');
    if (!sourceLoader || typeof sourceLoader.load !== 'function' || !renderer || typeof renderer.render !== 'function'
      || !storage || ['put', 'delete'].some((method) => typeof storage[method] !== 'function')
      || !exportAuditService || typeof exportAuditService.completed !== 'function'
      || !exportService || typeof exportService.markFailed !== 'function') throw new TypeError('PdfExportProcessor needs export runtime services.');
    this.repository = repository; this.queue = queue; this.sourceLoader = sourceLoader; this.renderer = renderer;
    this.storage = storage; this.exportAuditService = exportAuditService; this.exportService = exportService;
    this.clock = clock; this.maxAttempts = maxAttempts;
  }

  async retry(record, job, code) {
    if (job.attempt + 1 >= this.maxAttempts) return this.fail(record, code, job);
    const base = this.clock();
    const baseDate = base instanceof Date ? base : new Date(base);
    const scheduledFor = new Date(baseDate.getTime() + (1_000 * (2 ** job.attempt))).toISOString();
    try {
      const requeued = await this.repository.withTransaction((transaction) => this.repository.requeue({
        transaction, firmId: record.firmId, exportId: record.id, updatedAt: scheduledFor,
      }));
      if (!requeued) return result('skipped', 'EXPORT_STATE_STALE');
      const next = { version: 1, exportId: record.id, firmId: record.firmId, scheduledFor, attempt: job.attempt + 1 };
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

  async process(job) {
    let valid; let lockToken; let uploadedKey = null;
    try {
      try { valid = validatePdfExportJob(job, this.maxAttempts); } catch { return result('skipped', 'EXPORT_JOB_INVALID'); }
      lockToken = await this.queue.acquireProcessingLock(valid.jobId);
      if (!lockToken) return result('skipped', 'EXPORT_JOB_DUPLICATE');
      const claimed = await this.repository.withTransaction((transaction) => this.repository.claimQueued({
        transaction, firmId: valid.firmId, exportId: valid.exportId, processingStartedAt: now(this.clock),
      }));
      if (!claimed) return result('skipped', 'EXPORT_STATE_STALE');
      const record = await this.repository.findByIdForFirm({ firmId: valid.firmId, exportId: valid.exportId });
      if (!record || !record.requestedByActorUserId) return this.fail({ ...claimed, requestedByActorUserId: record?.requestedByActorUserId ?? null }, 'EXPORT_SOURCE_NOT_FOUND', valid);
      try {
        const source = await this.sourceLoader.load(record);
        const documentModel = createExportDocumentModel(source);
        const rendered = await this.renderer.render({ exportId: record.id, generatedAt: now(this.clock), documentModel });
        const key = exportStorageKey({ firmId: record.firmId, exportId: record.id });
        uploadedKey = key;
        await this.storage.put({ key, contentType: rendered.contentType, body: rendered.body });
        const byteSize = rendered.body.length; const checksumSha256 = sha256(rendered.body);
        await this.repository.withTransaction(async (transaction) => {
          const completed = await this.repository.complete({
            transaction, firmId: record.firmId, exportId: record.id, storageKey: key, byteSize, checksumSha256, completedAt: now(this.clock),
          });
          if (!completed) throw Object.assign(new Error('stale'), { code: 'EXPORT_STATE_STALE' });
          try {
            await this.exportAuditService.completed({
              transaction, firmId: record.firmId, actorUserId: record.requestedByActorUserId, exportId: record.id,
              exportType: record.type, outputFormat: 'pdf', filterSummary: { sourceType: record.type }, byteSize, checksumSha256,
            });
          } catch (error) {
            const failure = error instanceof Error ? error : new Error('Export audit write failed.');
            failure.code = 'EXPORT_AUDIT_WRITE_FAILED';
            throw failure;
          }
        });
        return result('completed');
      } catch (error) {
        if (uploadedKey) await this.storage.delete({ key: uploadedKey }).catch(() => {});
        const code = stableFailure(error);
        return terminal(code) ? this.fail(record, code, valid) : this.retry(record, valid, code);
      }
    } catch (error) {
      return result('failed', error instanceof PdfExportQueueError ? error.code : 'EXPORT_PROCESSING_FAILED', false);
    } finally {
      if (lockToken) await this.queue.releaseProcessingLock(valid.jobId, lockToken).catch(() => {});
    }
  }
}
