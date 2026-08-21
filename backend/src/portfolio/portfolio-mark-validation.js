import { badRequest } from '../errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['pending', 'filed', 'registered', 'abandoned', 'expired', 'cancelled']);
const CREATE_FIELDS = new Set([
  'markText', 'jurisdiction', 'sourceRegistry', 'registryReference', 'niceClasses', 'status',
  'filingDate', 'registrationDate', 'renewalDate',
]);
const PATCH_FIELDS = CREATE_FIELDS;
const FILTER_FIELDS = new Set([
  'page', 'pageSize', 'status', 'jurisdiction', 'sourceRegistry', 'registryReference',
  'niceClass', 'renewalBefore', 'renewalAfter',
]);

function invalid(field, message) {
  throw badRequest('VALIDATION_ERROR', message, { field });
}

function plainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(field, `${field} must be an object.`);
  }
  return value;
}

function text(value, field, maximum, { uppercase = false } = {}) {
  if (typeof value !== 'string') invalid(field, `${field} must be a string.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maximum) {
    invalid(field, `${field} must be between 1 and ${maximum} characters.`);
  }
  return uppercase ? normalized.toUpperCase() : normalized;
}

export function parseCalendarDate(value, field) {
  if (typeof value !== 'string') invalid(field, `${field} must be a YYYY-MM-DD date or null.`);
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    invalid(field, `${field} must be a valid YYYY-MM-DD date.`);
  }
  const [year, month, day] = normalized.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    invalid(field, `${field} must be a valid YYYY-MM-DD date.`);
  }
  return normalized;
}

function nullableDate(value, field) {
  return value === null ? null : parseCalendarDate(value, field);
}

function niceClasses(value, field = 'niceClasses') {
  if (!Array.isArray(value) || value.length === 0 || value.length > 45) {
    invalid(field, `${field} must be a non-empty array of Nice classes.`);
  }
  if (value.some((entry) => !Number.isSafeInteger(entry) || entry < 1 || entry > 45)) {
    invalid(field, `${field} values must be integers from 1 through 45.`);
  }
  return [...new Set(value)].sort((left, right) => left - right);
}

function status(value, field = 'status') {
  const normalized = text(value, field, 20).toLowerCase();
  if (!STATUSES.has(normalized)) {
    invalid(field, 'status must be pending, filed, registered, abandoned, expired, or cancelled.');
  }
  return normalized;
}

function jurisdiction(value, field = 'jurisdiction') {
  const normalized = text(value, field, 8, { uppercase: true });
  if (!/^[A-Z0-9-]+$/.test(normalized)) {
    invalid(field, 'jurisdiction must be an ISO country or region code.');
  }
  return normalized;
}

function assertKnownFields(input, supportedFields) {
  for (const field of Object.keys(input)) {
    if (!supportedFields.has(field)) invalid(field, `${field} is not supported.`);
  }
}

function parseField(field, value) {
  switch (field) {
    case 'markText': return text(value, field, 200);
    case 'jurisdiction': return jurisdiction(value, field);
    case 'sourceRegistry': return text(value, field, 100, { uppercase: true });
    case 'registryReference': return text(value, field, 200);
    case 'niceClasses': return niceClasses(value, field);
    case 'status': return status(value, field);
    case 'filingDate':
    case 'registrationDate':
    case 'renewalDate': return nullableDate(value, field);
    default: return undefined;
  }
}

export function parsePortfolioMarkCreate(input) {
  const body = plainObject(input, 'body');
  assertKnownFields(body, CREATE_FIELDS);
  for (const field of ['markText', 'jurisdiction', 'sourceRegistry', 'registryReference', 'niceClasses', 'status']) {
    if (!Object.hasOwn(body, field)) invalid(field, `${field} is required.`);
  }
  const parsed = {};
  for (const field of CREATE_FIELDS) {
    if (Object.hasOwn(body, field)) parsed[field] = parseField(field, body[field]);
  }
  for (const field of ['filingDate', 'registrationDate', 'renewalDate']) {
    if (!Object.hasOwn(parsed, field)) parsed[field] = null;
  }
  return parsed;
}

export function parsePortfolioMarkPatch(input) {
  const body = plainObject(input, 'body');
  assertKnownFields(body, PATCH_FIELDS);
  if (Object.keys(body).length === 0) invalid('body', 'PATCH body must contain at least one mutable field.');
  const parsed = {};
  for (const [field, value] of Object.entries(body)) parsed[field] = parseField(field, value);
  return parsed;
}

function queryScalar(value, field) {
  if (typeof value !== 'string') invalid(field, `${field} must be a scalar value.`);
  return value;
}

function positiveInteger(value, field, defaultValue, maximum) {
  if (value === undefined) return defaultValue;
  const normalized = queryScalar(value, field).trim();
  if (!/^\d+$/.test(normalized)) invalid(field, `${field} must be an integer.`);
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    invalid(field, `${field} must be between 1 and ${maximum}.`);
  }
  return number;
}

export function parsePortfolioMarkFilters(query) {
  const input = plainObject(query, 'query');
  for (const field of Object.keys(input)) {
    if (!FILTER_FIELDS.has(field)) invalid(field, `${field} is not a supported filter.`);
  }

  const renewalBefore = input.renewalBefore === undefined
    ? null : parseCalendarDate(queryScalar(input.renewalBefore, 'renewalBefore'), 'renewalBefore');
  const renewalAfter = input.renewalAfter === undefined
    ? null : parseCalendarDate(queryScalar(input.renewalAfter, 'renewalAfter'), 'renewalAfter');
  if (renewalBefore && renewalAfter && renewalAfter > renewalBefore) {
    invalid('renewalAfter', 'renewalAfter must not be after renewalBefore.');
  }

  let filterNiceClass = null;
  if (input.niceClass !== undefined) {
    const raw = queryScalar(input.niceClass, 'niceClass').trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 45) {
      invalid('niceClass', 'niceClass must be an integer from 1 through 45.');
    }
    filterNiceClass = Number(raw);
  }

  return {
    status: input.status === undefined ? null : status(queryScalar(input.status, 'status')),
    jurisdiction: input.jurisdiction === undefined
      ? null : jurisdiction(queryScalar(input.jurisdiction, 'jurisdiction')),
    sourceRegistry: input.sourceRegistry === undefined
      ? null : text(queryScalar(input.sourceRegistry, 'sourceRegistry'), 'sourceRegistry', 100, { uppercase: true }),
    registryReference: input.registryReference === undefined
      ? null : text(queryScalar(input.registryReference, 'registryReference'), 'registryReference', 200),
    niceClass: filterNiceClass,
    renewalBefore,
    renewalAfter,
  };
}

export function parsePortfolioMarkPagination(query) {
  return {
    page: positiveInteger(query.page, 'page', 1, 100_000),
    pageSize: positiveInteger(query.pageSize, 'pageSize', 25, 100),
  };
}

export function parsePortfolioMarkId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    invalid('id', 'id must be a UUID.');
  }
  return value;
}
