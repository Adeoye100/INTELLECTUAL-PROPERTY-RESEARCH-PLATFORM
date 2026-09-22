import { createExportDocumentModel } from './export-document-model.js';
import { PdfExportQueueError, validatePdfExportJob } from './pdf-export-queue.js';
import { exportStorageKey, sha256 } from './export-storage.js';
import { PdfExportLifecycle } from './pdf-export-lifecycle.js';

function result(outcome, code = null, retryable = false) { return { outcome, code, retryable }; }
function now(clock) {
  const value = clock(); const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('clock');
  return date.toISOString();
}
function stableFailure(error) {
  const code = error?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) return code;
  return 'EXPORT_PROCESSING_FAILED';
}
function terminal(code) {
  return ['EXPORT_SOURCE_NOT_FOUND', 'EXPORT_RENDER_INVALID', 'EXPORT_REQUEST_INVALID', 'EXPORT_JOB_INVALID'].includes(code);
}

export class PdfExportProcessor {
  constructor({ lifecycle, repository, queue, sourceLoader, renderer, storage, exportAuditService, exportService, clock = () => new Date(), maxAttempts = 3 }) {
    if (!queue || ['acquireProcessingLock', 'releaseProcessingLock'].some((method) => typeof queue[method] !== 'function')) throw new TypeError('PdfExportProcessor needs an export queue.');
    if (!sourceLoader || typeof sourceLoader.load !== 'function' || !renderer || typeof renderer.render !== 'function'
      || !storage || ['put', 'delete'].some((method) => typeof storage[method] !== 'function')) throw new TypeError('PdfExportProcessor needs source, renderer, and storage modules.');
    this.queue = queue; this.sourceLoader = sourceLoader; this.renderer = renderer; this.storage = storage;
    this.clock = clock; this.maxAttempts = maxAttempts;
    this.lifecycle = lifecycle ?? new PdfExportLifecycle({ repository, queue, exportAuditService, exportService, clock, maxAttempts });
  }

  async process(job) {
    let valid; let lockToken; let uploadedKey = null;
    try {
      try { valid = validatePdfExportJob(job, this.maxAttempts); } catch { return result('skipped', 'EXPORT_JOB_INVALID'); }
      lockToken = await this.queue.acquireProcessingLock(valid.jobId);
      if (!lockToken) return result('skipped', 'EXPORT_JOB_DUPLICATE');
      const claimed = await this.lifecycle.claim(valid);
      if (!claimed) return result('skipped', 'EXPORT_STATE_STALE');
      const record = await this.lifecycle.find(valid);
      if (!record || !record.requestedByActorUserId) return this.lifecycle.fail({ ...claimed, requestedByActorUserId: record?.requestedByActorUserId ?? null }, 'EXPORT_SOURCE_NOT_FOUND', valid);
      try {
        const source = await this.sourceLoader.load(record);
        const documentModel = createExportDocumentModel(source);
        const rendered = await this.renderer.render({ exportId: record.id, generatedAt: now(this.clock), documentModel });
        const key = exportStorageKey({ firmId: record.firmId, exportId: record.id });
        uploadedKey = key;
        await this.storage.put({ key, contentType: rendered.contentType, body: rendered.body });
        const byteSize = rendered.body.length; const checksumSha256 = sha256(rendered.body);
        await this.lifecycle.complete(record, { storageKey: key, byteSize, checksumSha256 });
        return result('completed');
      } catch (error) {
        if (uploadedKey) await this.storage.delete({ key: uploadedKey }).catch(() => {});
        const code = stableFailure(error);
        return terminal(code) ? this.lifecycle.fail(record, code, valid) : this.lifecycle.retry(record, valid, code);
      }
    } catch (error) {
      return result('failed', error instanceof PdfExportQueueError ? error.code : 'EXPORT_PROCESSING_FAILED', false);
    } finally {
      if (lockToken) await this.queue.releaseProcessingLock(valid.jobId, lockToken).catch(() => {});
    }
  }
}
