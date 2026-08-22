import { randomUUID } from 'node:crypto';
import { AppError, badRequest } from '../errors.js';
import { isSupportedAuditAction, isSupportedAuditEntityType } from './audit-taxonomy.js';
import { sanitizeAuditObject } from './audit-sanitizer.js';

export const AUDIT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_REQUEST_CONTEXT = Object.freeze({ requestId: null, ipAddress: null, userAgent: null });

function auditError(code, message) {
  return badRequest(code, message);
}

function uuid(value, code, message, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !AUDIT_UUID_PATTERN.test(value)) throw auditError(code, message);
  return value;
}

function timestamp(clock, supplied) {
  const value = supplied === undefined ? clock() : supplied;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw auditError('AUDIT_PAYLOAD_INVALID', 'Audit occurrence time must be valid.');
  return date.toISOString();
}

function nullableText(value, maximum) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw auditError('AUDIT_PAYLOAD_INVALID', 'Audit request context is invalid.');
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function requestContext(value) {
  if (value === undefined || value === null) return EMPTY_REQUEST_CONTEXT;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw auditError('AUDIT_PAYLOAD_INVALID', 'Audit request context is invalid.');
  }
  return {
    requestId: nullableText(value.requestId, 128),
    ipAddress: nullableText(value.ipAddress, 64),
    userAgent: nullableText(value.userAgent, 512),
  };
}

function sanitizeState(value) {
  if (value === null || value === undefined) return null;
  return sanitizeAuditObject(value);
}

function meaningfulMetadata(metadata) {
  return Object.keys(metadata).length > 0;
}

function sanitizeRecord(record) {
  return {
    ...record,
    beforeState: record.beforeState === null ? null : sanitizeAuditObject(record.beforeState),
    afterState: record.afterState === null ? null : sanitizeAuditObject(record.afterState),
    metadata: sanitizeAuditObject(record.metadata),
  };
}

export class AuditService {
  constructor({ repository, clock = () => new Date(), idGenerator = randomUUID }) {
    if (!repository || typeof repository.insert !== 'function') {
      throw new TypeError('AuditService needs an insert-capable audit repository.');
    }
    if (typeof clock !== 'function' || typeof idGenerator !== 'function') {
      throw new TypeError('AuditService needs a clock and ID generator.');
    }
    this.repository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async record({
    transaction = null, requireTransaction = false, firmId, actorUserId, action, entityType,
    entityId = null, beforeState = null, afterState = null, metadata = {}, requestContext: context,
    occurredAt,
  }) {
    if (transaction && typeof transaction.query !== 'function') {
      throw auditError('AUDIT_TRANSACTION_REQUIRED', 'Audit transaction is invalid.');
    }
    if (requireTransaction && (!transaction || typeof transaction.query !== 'function')) {
      throw auditError('AUDIT_TRANSACTION_REQUIRED', 'Audit recording requires the mutation transaction.');
    }
    const scopedFirmId = uuid(firmId, 'AUDIT_FIRM_INVALID', 'Audit firm is invalid.');
    const scopedActorUserId = uuid(actorUserId, 'AUDIT_ACTOR_INVALID', 'Audit actor is invalid.');
    if (!isSupportedAuditAction(action)) throw auditError('AUDIT_ACTION_INVALID', 'Audit action is not supported.');
    if (!isSupportedAuditEntityType(entityType)) throw auditError('AUDIT_ENTITY_TYPE_INVALID', 'Audit entity type is not supported.');
    const scopedEntityId = uuid(entityId, 'AUDIT_ENTITY_ID_INVALID', 'Audit entity ID is invalid.', { nullable: true });
    const sanitizedBeforeState = sanitizeState(beforeState);
    const sanitizedAfterState = sanitizeState(afterState);
    const sanitizedMetadata = sanitizeAuditObject(metadata ?? {});
    if (!sanitizedBeforeState && !sanitizedAfterState && !meaningfulMetadata(sanitizedMetadata)) {
      throw auditError('AUDIT_PAYLOAD_INVALID', 'Audit records require a state snapshot or metadata.');
    }
    const generatedId = this.idGenerator();
    const id = uuid(generatedId, 'AUDIT_WRITE_FAILED', 'Audit ID generation failed.');
    const payload = {
      transaction, id, firmId: scopedFirmId, actorUserId: scopedActorUserId, action, entityType,
      entityId: scopedEntityId, beforeState: sanitizedBeforeState, afterState: sanitizedAfterState,
      metadata: sanitizedMetadata, requestContext: requestContext(context), occurredAt: timestamp(this.clock, occurredAt),
    };
    let inserted;
    try {
      inserted = await this.repository.insert(payload);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'AUDIT_WRITE_FAILED', 'Audit record could not be written.');
    }
    if (!inserted) throw new AppError(500, 'AUDIT_WRITE_FAILED', 'Audit record could not be written.');
    return sanitizeRecord(inserted);
  }

  async list({ firmId, filters, pagination }) {
    if (typeof this.repository.list !== 'function') {
      throw new TypeError('AuditService audit repository does not support reads.');
    }
    const scopedFirmId = uuid(firmId, 'AUDIT_FIRM_INVALID', 'Audit firm is invalid.');
    const rows = await this.repository.list({ firmId: scopedFirmId, filters, pagination });
    const hasMore = rows.length > pagination.pageSize;
    const items = rows.slice(0, pagination.pageSize).map(sanitizeRecord);
    const last = items.at(-1);
    return {
      auditLogs: items,
      nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ occurredAt: last.occurredAt, id: last.id })).toString('base64url') : null,
    };
  }

  async get({ firmId, auditLogId }) {
    if (typeof this.repository.findById !== 'function') {
      throw new TypeError('AuditService audit repository does not support reads.');
    }
    const scopedFirmId = uuid(firmId, 'AUDIT_FIRM_INVALID', 'Audit firm is invalid.');
    const scopedAuditLogId = uuid(auditLogId, 'AUDIT_ENTITY_ID_INVALID', 'Audit log ID is invalid.');
    const found = await this.repository.findById({ firmId: scopedFirmId, auditLogId: scopedAuditLogId });
    if (!found) throw new AppError(404, 'AUDIT_LOG_NOT_FOUND', 'Audit log not found.');
    return sanitizeRecord(found);
  }
}

export function parseAuditLogListQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw auditError('AUDIT_PAYLOAD_INVALID', 'Audit log query is invalid.');
  }
  const supported = new Set(['actorUserId', 'action', 'entityType', 'entityId', 'occurredFrom', 'occurredTo', 'pageSize', 'cursor']);
  for (const key of Object.keys(query)) {
    if (!supported.has(key)) throw auditError('AUDIT_PAYLOAD_INVALID', `Unsupported audit-log filter: ${key}.`);
  }
  const scalar = (value, code, message) => {
    if (typeof value !== 'string') throw auditError(code, message);
    return value.trim();
  };
  const actorUserId = query.actorUserId === undefined ? null : uuid(
    scalar(query.actorUserId, 'AUDIT_ACTOR_INVALID', 'actorUserId must be a UUID.'),
    'AUDIT_ACTOR_INVALID', 'actorUserId must be a UUID.',
  );
  const entityId = query.entityId === undefined ? null : uuid(
    scalar(query.entityId, 'AUDIT_ENTITY_ID_INVALID', 'entityId must be a UUID.'),
    'AUDIT_ENTITY_ID_INVALID', 'entityId must be a UUID.',
  );
  const action = query.action === undefined ? null : scalar(query.action, 'AUDIT_ACTION_INVALID', 'Audit action is invalid.');
  if (action && !isSupportedAuditAction(action)) throw auditError('AUDIT_ACTION_INVALID', 'Audit action is invalid.');
  const entityType = query.entityType === undefined ? null : scalar(query.entityType, 'AUDIT_ENTITY_TYPE_INVALID', 'Audit entity type is invalid.');
  if (entityType && !isSupportedAuditEntityType(entityType)) throw auditError('AUDIT_ENTITY_TYPE_INVALID', 'Audit entity type is invalid.');
  const parseTime = (value, field) => {
    if (value === undefined) return null;
    const raw = scalar(value, 'AUDIT_PAYLOAD_INVALID', `${field} must be an ISO timestamp.`);
    const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/);
    if (!parts) throw auditError('AUDIT_PAYLOAD_INVALID', `${field} must be an ISO timestamp.`);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())
      || parsed.getUTCFullYear() !== Number(parts[1])
      || parsed.getUTCMonth() + 1 !== Number(parts[2])
      || parsed.getUTCDate() !== Number(parts[3])
      || parsed.getUTCHours() !== Number(parts[4])
      || parsed.getUTCMinutes() !== Number(parts[5])
      || parsed.getUTCSeconds() !== Number(parts[6])) {
      throw auditError('AUDIT_PAYLOAD_INVALID', `${field} must be an ISO timestamp.`);
    }
    return parsed.toISOString();
  };
  const occurredFrom = parseTime(query.occurredFrom, 'occurredFrom');
  const occurredTo = parseTime(query.occurredTo, 'occurredTo');
  if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
    throw auditError('AUDIT_PAYLOAD_INVALID', 'occurredFrom must not be after occurredTo.');
  }
  let cursor = null;
  if (query.cursor !== undefined) {
    const raw = scalar(query.cursor, 'AUDIT_PAYLOAD_INVALID', 'Audit cursor is invalid.');
    if (raw.length > 512) throw auditError('AUDIT_PAYLOAD_INVALID', 'Audit cursor is invalid.');
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      cursor = {
        occurredAt: parseTime(parsed.occurredAt, 'cursor.occurredAt'),
        id: uuid(parsed.id, 'AUDIT_ENTITY_ID_INVALID', 'Audit cursor is invalid.'),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw auditError('AUDIT_PAYLOAD_INVALID', 'Audit cursor is invalid.');
    }
  }
  const pageSizeRaw = query.pageSize === undefined ? '25' : scalar(query.pageSize, 'AUDIT_PAYLOAD_INVALID', 'pageSize must be an integer.');
  if (!/^\d+$/.test(pageSizeRaw) || Number(pageSizeRaw) < 1 || Number(pageSizeRaw) > 100) {
    throw auditError('AUDIT_PAYLOAD_INVALID', 'pageSize must be between 1 and 100.');
  }
  return { filters: { actorUserId, action, entityType, entityId, occurredFrom, occurredTo }, pagination: { cursor, pageSize: Number(pageSizeRaw) } };
}
