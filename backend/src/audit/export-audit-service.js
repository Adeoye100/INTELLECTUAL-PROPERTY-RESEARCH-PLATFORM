import { badRequest } from '../errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from './audit-taxonomy.js';
import { sanitizeAuditObject } from './audit-sanitizer.js';
import { AUDIT_UUID_PATTERN } from './audit-service.js';

function text(value, field, maximum) {
  if (typeof value !== 'string') throw badRequest('AUDIT_PAYLOAD_INVALID', `${field} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw badRequest('AUDIT_PAYLOAD_INVALID', `${field} is invalid.`);
  }
  return normalized;
}

function exportId(value) {
  if (typeof value !== 'string' || !AUDIT_UUID_PATTERN.test(value)) {
    throw badRequest('AUDIT_ENTITY_ID_INVALID', 'exportId must be a UUID.');
  }
  return value;
}

const FORBIDDEN_SUMMARY_KEY = /(url|content|file|blob|result|token|authorization|cookie|secret|password|key)/i;

function safeFilterSummary(value) {
  const sanitized = sanitizeAuditObject(value ?? {});
  const prune = (entry) => {
    if (Array.isArray(entry)) return entry.map(prune);
    if (!entry || typeof entry !== 'object') return entry;
    const output = {};
    for (const [key, nested] of Object.entries(entry)) {
      if (!FORBIDDEN_SUMMARY_KEY.test(key)) output[key] = prune(nested);
    }
    return output;
  };
  return prune(sanitized);
}

function safeMetadata({ exportType, outputFormat, filterSummary, errorCode }) {
  const metadata = {
    exportType: text(exportType, 'exportType', 80),
    outputFormat: text(outputFormat, 'outputFormat', 30),
    filterSummary: safeFilterSummary(filterSummary),
  };
  if (errorCode !== undefined) {
    const normalized = text(errorCode, 'errorCode', 80);
    if (!/^[A-Z0-9_]+$/.test(normalized)) {
      throw badRequest('AUDIT_PAYLOAD_INVALID', 'errorCode must be a stable error code.');
    }
    metadata.errorCode = normalized;
  }
  return metadata;
}

export class ExportAuditService {
  constructor({ auditService }) {
    if (!auditService || typeof auditService.record !== 'function') {
      throw new TypeError('ExportAuditService needs an audit service.');
    }
    this.auditService = auditService;
  }

  async requested(input) { return this.record(AUDIT_ACTIONS.EXPORT_REQUESTED, input); }
  async completed(input) { return this.record(AUDIT_ACTIONS.EXPORT_COMPLETED, input); }
  async failed(input) { return this.record(AUDIT_ACTIONS.EXPORT_FAILED, input, { failed: true }); }

  async record(action, input, { failed = false } = {}) {
    return this.auditService.record({
      transaction: input?.transaction ?? null,
      firmId: input?.firmId,
      actorUserId: input?.actorUserId,
      action,
      entityType: AUDIT_ENTITY_TYPES.EXPORT,
      entityId: exportId(input?.exportId),
      afterState: { id: input.exportId, lifecycle: action.split('.')[1] },
      metadata: safeMetadata({
        exportType: input?.exportType,
        outputFormat: input?.outputFormat,
        filterSummary: input?.filterSummary,
        ...(failed ? { errorCode: input?.errorCode } : {}),
      }),
      requestContext: input?.requestContext,
      occurredAt: input?.occurredAt,
    });
  }
}
