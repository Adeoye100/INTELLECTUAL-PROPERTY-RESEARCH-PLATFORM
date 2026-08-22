import { badRequest } from '../errors.js';

export const EXPORT_TYPES = Object.freeze(['search_results', 'risk_report', 'portfolio_summary']);
export const EXPORT_STATUSES = Object.freeze(['queued', 'processing', 'completed', 'failed']);
export const EXPORT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_EXPORT_PARAMETERS_BYTES = 4 * 1024;
export const MAX_EXPORT_PAGE_SIZE = 100;
const MAX_DEPTH = 6;
const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const TYPE_SET = new Set(EXPORT_TYPES);
const STATUS_SET = new Set(EXPORT_STATUSES);

function invalid(code, message, field) { throw badRequest(code, message, field ? { field } : undefined); }
function object(value, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid('EXPORT_REQUEST_INVALID', `${field} must be an object.`, field);
  }
  return value;
}
function text(value, field, maximum, { pattern = null, nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') invalid('EXPORT_REQUEST_INVALID', `${field} must be a string.`, field);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || (pattern && !pattern.test(normalized))) {
    invalid('EXPORT_REQUEST_INVALID', `${field} is invalid.`, field);
  }
  return normalized;
}
function uuid(value, field) {
  if (typeof value !== 'string' || !EXPORT_UUID_PATTERN.test(value)) {
    invalid('EXPORT_REQUEST_INVALID', `${field} must be a UUID.`, field);
  }
  return value;
}
function boolean(value, field) {
  if (typeof value !== 'boolean') invalid('EXPORT_REQUEST_INVALID', `${field} must be a boolean.`, field);
  return value;
}

function cloneJson(value, depth = 0, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('EXPORT_REQUEST_INVALID', 'parameters must contain finite JSON values.', 'parameters');
    return value;
  }
  if (typeof value !== 'object' || depth > MAX_DEPTH || seen.has(value)) {
    invalid('EXPORT_REQUEST_INVALID', 'parameters must be bounded JSON data.', 'parameters');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 20) invalid('EXPORT_REQUEST_INVALID', 'parameters arrays are too long.', 'parameters');
      return value.map((entry) => cloneJson(entry, depth + 1, seen));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      invalid('EXPORT_REQUEST_INVALID', 'parameters must be plain JSON objects.', 'parameters');
    }
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (POLLUTION_KEYS.has(key)) invalid('EXPORT_REQUEST_INVALID', 'parameters contain an unsafe key.', 'parameters');
      output[key] = cloneJson(value[key], depth + 1, seen);
    }
    return output;
  } finally { seen.delete(value); }
}

function parametersFor(type, value) {
  const input = object(value, 'parameters');
  let output;
  if (type === 'search_results') {
    if (Object.keys(input).length) invalid('EXPORT_REQUEST_INVALID', 'search_results parameters must be empty.', 'parameters');
    output = {};
  } else if (type === 'risk_report') {
    if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'resultId')) {
      invalid('EXPORT_REQUEST_INVALID', 'risk_report parameters must contain only resultId.', 'parameters');
    }
    output = { resultId: text(input.resultId, 'parameters.resultId', 200, { pattern: /^[\w.:/-]+$/ }) };
  } else {
    const allowed = new Set(['includeWatches', 'includeAlerts']);
    for (const key of Object.keys(input)) if (!allowed.has(key)) {
      invalid('EXPORT_REQUEST_INVALID', `parameters.${key} is not supported.`, 'parameters');
    }
    output = {};
    if (Object.hasOwn(input, 'includeWatches')) output.includeWatches = boolean(input.includeWatches, 'parameters.includeWatches');
    if (Object.hasOwn(input, 'includeAlerts')) output.includeAlerts = boolean(input.includeAlerts, 'parameters.includeAlerts');
  }
  const cloned = cloneJson(output);
  if (Buffer.byteLength(JSON.stringify(cloned), 'utf8') > MAX_EXPORT_PARAMETERS_BYTES) {
    invalid('EXPORT_REQUEST_INVALID', 'parameters are too large.', 'parameters');
  }
  return cloned;
}

export function parseExportId(value, field = 'id') { return uuid(value, field); }
export function parseExportCreate(input) {
  const body = object(input);
  const allowed = new Set(['type', 'sourceEntityId', 'parameters', 'idempotencyKey']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) invalid('EXPORT_REQUEST_INVALID', `${key} is not supported.`, key);
  const type = text(body.type, 'type', 40);
  if (!TYPE_SET.has(type)) invalid('EXPORT_REQUEST_INVALID', 'type is not supported.', 'type');
  if (!Object.hasOwn(body, 'parameters')) invalid('EXPORT_REQUEST_INVALID', 'parameters is required.', 'parameters');
  return {
    type,
    sourceEntityId: uuid(body.sourceEntityId, 'sourceEntityId'),
    parameters: parametersFor(type, body.parameters),
    idempotencyKey: text(body.idempotencyKey, 'idempotencyKey', 128, { pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/ }),
  };
}

function cursor(value) {
  if (typeof value !== 'string' || value.length > 512) invalid('EXPORT_CURSOR_INVALID', 'cursor is invalid.', 'cursor');
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length !== 2
      || typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))
      || typeof parsed.id !== 'string' || !EXPORT_UUID_PATTERN.test(parsed.id)) throw new Error('invalid');
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch { invalid('EXPORT_CURSOR_INVALID', 'cursor is invalid.', 'cursor'); }
}
function size(value) {
  if (value === undefined) return 25;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_EXPORT_PAGE_SIZE) {
    invalid('EXPORT_REQUEST_INVALID', `pageSize must be between 1 and ${MAX_EXPORT_PAGE_SIZE}.`, 'pageSize');
  }
  return Number(value);
}
export function parseExportListQuery(query) {
  object(query, 'query');
  const allowed = new Set(['pageSize', 'cursor', 'status', 'type']);
  for (const key of Object.keys(query)) if (!allowed.has(key)) invalid('EXPORT_REQUEST_INVALID', `${key} is not a supported filter.`, key);
  const status = query.status === undefined ? null : text(query.status, 'status', 20);
  if (status && !STATUS_SET.has(status)) invalid('EXPORT_REQUEST_INVALID', 'status is not supported.', 'status');
  const type = query.type === undefined ? null : text(query.type, 'type', 40);
  if (type && !TYPE_SET.has(type)) invalid('EXPORT_REQUEST_INVALID', 'type is not supported.', 'type');
  return { filters: { status, type }, pagination: { pageSize: size(query.pageSize), cursor: query.cursor === undefined ? null : cursor(query.cursor) } };
}

export function exportCursor(record) {
  return Buffer.from(JSON.stringify({ createdAt: record.createdAt, id: record.id })).toString('base64url');
}

export function parseExportRequestId(value) {
  return text(value, 'requestId', 128, { pattern: /^[A-Za-z0-9._:-]+$/ });
}

export function cloneExportParameters(value) { return cloneJson(value); }
