import { AppError } from '../errors.js';

export const AUDIT_REDACTION = '[REDACTED]';
export const DEFAULT_AUDIT_SANITIZER_LIMITS = Object.freeze({
  maxDepth: 8,
  maxArrayLength: 100,
  maxSerializedBytes: 16 * 1024,
});

const SENSITIVE_KEYS = new Set([
  'password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken',
  'authorization', 'cookie', 'secret', 'apikey', 'privatekey', 'clientsecret',
  'jwt', 'sessiontoken',
]);
const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function invalid(message = 'Audit payload must contain JSON-safe values.') {
  return new AppError(400, 'AUDIT_PAYLOAD_INVALID', message);
}

function tooLarge() {
  return new AppError(400, 'AUDIT_PAYLOAD_TOO_LARGE', 'Audit payload exceeds the configured size limit.');
}

function normalizedKey(key) {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeValue(value, { depth, limits, ancestors }) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid();
    return value;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value === undefined) {
    throw invalid();
  }
  if (depth > limits.maxDepth) throw invalid('Audit payload exceeds the configured nesting depth.');
  if (Array.isArray(value)) {
    if (value.length > limits.maxArrayLength) throw invalid('Audit payload array exceeds the configured length.');
    if (ancestors.has(value)) throw invalid('Audit payload must not contain circular references.');
    ancestors.add(value);
    try {
      return value.map((entry) => sanitizeValue(entry, { depth: depth + 1, limits, ancestors }));
    } finally {
      ancestors.delete(value);
    }
  }
  if (!plainRecord(value) || ancestors.has(value)) {
    throw invalid(ancestors.has(value)
      ? 'Audit payload must not contain circular references.'
      : undefined);
  }
  ancestors.add(value);
  try {
    const sanitized = {};
    for (const key of Object.keys(value).sort()) {
      if (POLLUTION_KEYS.has(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalid();
      sanitized[key] = SENSITIVE_KEYS.has(normalizedKey(key))
        ? AUDIT_REDACTION
        : sanitizeValue(descriptor.value, { depth: depth + 1, limits, ancestors });
    }
    return sanitized;
  } finally {
    ancestors.delete(value);
  }
}

export function sanitizeAuditData(value, options = {}) {
  const limits = { ...DEFAULT_AUDIT_SANITIZER_LIMITS, ...options };
  if (
    !Number.isSafeInteger(limits.maxDepth) || limits.maxDepth < 0
    || !Number.isSafeInteger(limits.maxArrayLength) || limits.maxArrayLength < 0
    || !Number.isSafeInteger(limits.maxSerializedBytes) || limits.maxSerializedBytes < 1
  ) throw new TypeError('Audit sanitizer limits must be non-negative safe integers.');
  const sanitized = sanitizeValue(value, { depth: 0, limits, ancestors: new WeakSet() });
  let serialized;
  try {
    serialized = JSON.stringify(sanitized);
  } catch {
    throw invalid();
  }
  if (Buffer.byteLength(serialized, 'utf8') > limits.maxSerializedBytes) throw tooLarge();
  return sanitized;
}

export function sanitizeAuditObject(value, options) {
  if (!plainRecord(value)) throw invalid('Audit state and metadata must be JSON objects.');
  return sanitizeAuditData(value, options);
}
