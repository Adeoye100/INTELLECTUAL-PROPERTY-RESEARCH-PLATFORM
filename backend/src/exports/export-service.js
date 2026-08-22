import { randomUUID } from 'node:crypto';
import { AppError, forbidden } from '../errors.js';
import {
  cloneExportParameters, exportCursor, parseExportCreate, parseExportId, parseExportListQuery,
  parseExportRequestId, EXPORT_UUID_PATTERN,
} from './export-validation.js';
import { deterministicPdfExportJobId } from './pdf-export-queue.js';
import { sha256 } from './export-storage.js';

function scope(value, message) {
  if (typeof value !== 'string' || !EXPORT_UUID_PATTERN.test(value)) throw forbidden(message);
  return value;
}
function now(clock) {
  const value = clock(); const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(500, 'EXPORT_WRITE_FAILED', 'Export could not be created.');
  return date.toISOString();
}
function notFound() { return new AppError(404, 'EXPORT_NOT_FOUND', 'Export not found.'); }
function idempotencyConflict() { return new AppError(409, 'EXPORT_IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to a different export request.'); }
function writeFailure(error) {
  if (error instanceof AppError) return error;
  return new AppError(500, 'EXPORT_WRITE_FAILED', 'Export could not be created.');
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function equivalent(existing, proposed, actorUserId) {
  return existing.requestedByActorUserId === actorUserId && existing.type === proposed.type
    && existing.sourceEntityId === proposed.sourceEntityId && stable(existing.parameters) === stable(proposed.parameters);
}
function safeFilterSummary(record) {
  return { sourceType: record.type, parameterNames: Object.keys(record.parameters).sort() };
}
export function exportResponse(record) {
  return {
    id: record.id, type: record.type, status: record.status, sourceEntityId: record.sourceEntityId,
    requestId: record.requestId, parameters: cloneExportParameters(record.parameters), mimeType: record.mimeType,
    byteSize: record.byteSize, checksumSha256: record.checksumSha256, failureCode: record.failureCode,
    queuedAt: record.queuedAt, processingStartedAt: record.processingStartedAt, completedAt: record.completedAt,
    failedAt: record.failedAt, createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}
export function exportListResponse(record) {
  const item = exportResponse(record);
  delete item.parameters; delete item.checksumSha256;
  return item;
}

export class ExportService {
  constructor({ repository, queue, exportAuditService, storage, clock = () => new Date(), idGenerator = randomUUID, maxAttempts = 3 }) {
    const methods = ['withTransaction', 'insert', 'findByIdempotencyKeyForFirm', 'findByIdForFirm', 'listForFirm', 'fail'];
    if (!repository || methods.some((method) => typeof repository[method] !== 'function')) throw new TypeError('ExportService needs an export repository.');
    if (!queue || typeof queue.enqueue !== 'function') throw new TypeError('ExportService needs an export queue.');
    if (!exportAuditService || ['requested', 'failed'].some((method) => typeof exportAuditService[method] !== 'function')) throw new TypeError('ExportService needs ExportAuditService.');
    if (!storage || typeof storage.get !== 'function') throw new TypeError('ExportService needs private export storage.');
    if (typeof clock !== 'function' || typeof idGenerator !== 'function' || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new TypeError('ExportService needs valid runtime dependencies.');
    this.repository = repository; this.queue = queue; this.exportAuditService = exportAuditService; this.storage = storage;
    this.clock = clock; this.idGenerator = idGenerator; this.maxAttempts = maxAttempts;
  }

  async createExport({ firmId, actorUserId, input, requestContext = null }) {
    const scopedFirmId = scope(firmId, 'A firm membership is required.');
    const scopedActorUserId = scope(actorUserId, 'A verified user identity is required.');
    const parsed = parseExportCreate(input);
    const createdAt = now(this.clock);
    const requestId = parseExportRequestId(requestContext?.requestId ?? randomUUID());
    let created;
    try {
      created = await this.repository.withTransaction(async (transaction) => {
        const existing = await this.repository.findByIdempotencyKeyForFirm({ firmId: scopedFirmId, idempotencyKey: parsed.idempotencyKey, transaction });
        if (existing) {
          if (!equivalent(existing, parsed, scopedActorUserId)) throw idempotencyConflict();
          return { record: existing, created: false };
        }
        const record = {
          id: parseExportId(this.idGenerator(), 'exportId'), firmId: scopedFirmId, type: parsed.type,
          sourceEntityId: parsed.sourceEntityId, requestId, idempotencyKey: parsed.idempotencyKey,
          parameters: parsed.parameters, queuedAt: createdAt,
        };
        const inserted = await this.repository.insert({ transaction, exportRecord: record, actorUserId: scopedActorUserId });
        if (!inserted) {
          const concurrent = await this.repository.findByIdempotencyKeyForFirm({ firmId: scopedFirmId, idempotencyKey: parsed.idempotencyKey, transaction });
          if (!concurrent || !equivalent(concurrent, parsed, scopedActorUserId)) throw idempotencyConflict();
          return { record: concurrent, created: false };
        }
        await this.exportAuditService.requested({
          transaction, firmId: scopedFirmId, actorUserId: scopedActorUserId, exportId: inserted.id,
          exportType: inserted.type, outputFormat: 'pdf', filterSummary: safeFilterSummary(inserted), requestContext,
        });
        return { record: inserted, created: true };
      });
    } catch (error) { throw writeFailure(error); }
    if (!created.created) return { export: exportResponse(created.record), created: false };
    const job = {
      version: 1, exportId: created.record.id, firmId: scopedFirmId, scheduledFor: createdAt, attempt: 0,
      jobId: deterministicPdfExportJobId(created.record.id, createdAt, 0),
    };
    try { await this.queue.enqueue(job); } catch {
      await this.markFailed({ record: { ...created.record, requestedByActorUserId: scopedActorUserId }, failureCode: 'EXPORT_QUEUE_UNAVAILABLE', requestContext: null }).catch(() => {});
      throw new AppError(503, 'EXPORT_QUEUE_UNAVAILABLE', 'Export queue is temporarily unavailable.');
    }
    return { export: exportResponse(created.record), created: true };
  }

  async getExport({ firmId, exportId }) {
    const record = await this.repository.findByIdForFirm({ firmId: scope(firmId, 'A firm membership is required.'), exportId: parseExportId(exportId) });
    if (!record) throw notFound();
    return exportResponse(record);
  }
  async getExportRecord({ firmId, exportId }) {
    const record = await this.repository.findByIdForFirm({ firmId: scope(firmId, 'A firm membership is required.'), exportId: parseExportId(exportId) });
    if (!record) throw notFound();
    return record;
  }
  async listExports({ firmId, actorUserId, role, query }) {
    const parsed = parseExportListQuery(query ?? {});
    const scopedFirmId = scope(firmId, 'A firm membership is required.');
    const scopedActorUserId = scope(actorUserId, 'A verified user identity is required.');
    if (!['admin', 'attorney'].includes(role)) throw forbidden();
    const records = await this.repository.listForFirm({
      firmId: scopedFirmId, actorUserId: role === 'admin' ? null : scopedActorUserId, filters: parsed.filters, pagination: parsed.pagination,
    });
    const hasMore = records.length > parsed.pagination.pageSize;
    const exports = records.slice(0, parsed.pagination.pageSize).map(exportListResponse);
    const last = exports.at(-1);
    return { exports, nextCursor: hasMore && last ? exportCursor(last) : null };
  }
  async download({ firmId, exportId }) {
    const record = await this.getExportRecord({ firmId, exportId });
    if (record.status !== 'completed' || !record.storageKey || record.mimeType !== 'application/pdf') {
      throw new AppError(409, 'EXPORT_NOT_READY', 'Export is not ready for download.');
    }
    try {
      const body = await this.storage.get({ key: record.storageKey });
      if (!Buffer.isBuffer(body) || !body.subarray(0, 5).equals(Buffer.from('%PDF-'))
        || body.length !== record.byteSize || sha256(body) !== record.checksumSha256) {
        throw new Error('invalid export artifact');
      }
      return { id: record.id, body, mimeType: 'application/pdf' };
    } catch {
      throw new AppError(503, 'EXPORT_DOWNLOAD_UNAVAILABLE', 'Export download is temporarily unavailable.');
    }
  }
  async markFailed({ record, failureCode, requestContext = null }) {
    const failedAt = now(this.clock);
    return this.repository.withTransaction(async (transaction) => {
      const failed = await this.repository.fail({ transaction, firmId: record.firmId, exportId: record.id, failureCode, failedAt });
      if (!failed) return null;
      await this.exportAuditService.failed({
        transaction, firmId: failed.firmId, actorUserId: record.requestedByActorUserId, exportId: failed.id,
        exportType: failed.type, outputFormat: 'pdf', filterSummary: safeFilterSummary(failed), errorCode: failureCode, requestContext,
      });
      return failed;
    });
  }
}
