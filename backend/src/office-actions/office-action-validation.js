import { badRequest } from '../errors.js';
import { parseCalendarDate } from '../portfolio/portfolio-mark-validation.js';

export const OFFICE_ACTION_DOCUMENT_TYPES = Object.freeze([
  'office_action',
  'non_final_office_action',
  'final_office_action',
  'restriction_requirement',
  'suspension',
  'other',
]);
export const OFFICE_ACTION_SUMMARY_METHODS = Object.freeze(['registry', 'manual', 'extracted']);
export const OFFICE_ACTION_METADATA_FIELDS = Object.freeze([
  'documentTitle', 'documentLanguage', 'sourceRecordType', 'sourceUpdatedAt',
]);

const DOCUMENT_TYPE_SET = new Set(OFFICE_ACTION_DOCUMENT_TYPES);
const SUMMARY_METHOD_SET = new Set(OFFICE_ACTION_SUMMARY_METHODS);
const METADATA_FIELD_SET = new Set(OFFICE_ACTION_METADATA_FIELDS);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CREATE_FIELDS = new Set([
  'sourceRegistry', 'sourceReferenceId', 'applicationNumber', 'documentType', 'officeActionDate',
  'examinerName', 'examinerReasoningSummary', 'summaryMethod', 'sourceDocumentUrl', 'sourceMetadata',
]);
const PATCH_FIELDS = new Set([
  'applicationNumber', 'documentType', 'officeActionDate', 'examinerName',
  'examinerReasoningSummary', 'summaryMethod', 'sourceDocumentUrl', 'sourceMetadata',
]);
const INTERNAL_SOURCE_FIELDS = new Set([
  'sourceRegistry', 'sourceReferenceId', 'applicationNumber', 'markText', 'owner', 'jurisdiction',
  'documentType', 'officeActionDate', 'examinerName', 'examinerReasoningSummary', 'summaryMethod',
  'sourceDocumentUrl', 'sourceMetadata',
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

function knownFields(input, fields, field) {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEYS.has(key) || !fields.has(key)) invalid(key || field, `${key || field} is not supported.`);
  }
}

function text(value, field, maximum, { uppercase = false } = {}) {
  if (typeof value !== 'string') invalid(field, `${field} must be a string.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maximum) {
    invalid(field, `${field} must be between 1 and ${maximum} characters.`);
  }
  return uppercase ? normalized.toUpperCase() : normalized;
}

function nullableText(value, field, maximum, options) {
  if (value === null || value === undefined) return null;
  return text(value, field, maximum, options);
}

function registry(value, field = 'sourceRegistry') {
  const normalized = text(value, field, 100, { uppercase: true });
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    invalid(field, `${field} must use A-Z, 0-9, underscore, or hyphen.`);
  }
  return normalized;
}

function documentType(value, field = 'documentType') {
  const normalized = text(value, field, 80).toLowerCase();
  if (!DOCUMENT_TYPE_SET.has(normalized)) {
    invalid(field, `documentType must be one of: ${OFFICE_ACTION_DOCUMENT_TYPES.join(', ')}.`);
  }
  return normalized;
}

function summaryMethod(value, field = 'summaryMethod') {
  const normalized = text(value, field, 20).toLowerCase();
  if (!SUMMARY_METHOD_SET.has(normalized)) {
    invalid(field, `summaryMethod must be one of: ${OFFICE_ACTION_SUMMARY_METHODS.join(', ')}.`);
  }
  return normalized;
}

function nullableDate(value, field) {
  if (value === null || value === undefined) return null;
  return parseCalendarDate(value, field);
}

function plainTextSummary(value, field = 'examinerReasoningSummary') {
  const normalized = nullableText(value, field, 4_000);
  if (normalized !== null && /<\/?[A-Za-z][^>]*>/.test(normalized)) {
    invalid(field, `${field} must be plain text.`);
  }
  return normalized;
}

function sourceDocumentUrl(value, field = 'sourceDocumentUrl') {
  if (value === null || value === undefined) return null;
  const normalized = text(value, field, 2_048);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    invalid(field, `${field} must be a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    invalid(field, `${field} must be a credential-free HTTP(S) URL without query or fragment.`);
  }
  return parsed.toString();
}

export function parseOfficeActionSourceMetadata(value, { strict = true } = {}) {
  if (value === null || value === undefined) return {};
  const input = plainObject(value, 'sourceMetadata');
  const present = new Set(Object.keys(input));
  for (const key of present) {
    if (FORBIDDEN_KEYS.has(key) || (strict && !METADATA_FIELD_SET.has(key))) {
      invalid(key, `${key} is not supported in sourceMetadata.`);
    }
  }
  const parsed = {};
  for (const field of OFFICE_ACTION_METADATA_FIELDS) {
    if (!present.has(field)) continue;
    parsed[field] = text(input[field], `sourceMetadata.${field}`, field === 'documentTitle' ? 200 : 100);
  }
  return parsed;
}

function parseCore(input, { sourceResult = false, expectedSourceName = null } = {}) {
  const body = plainObject(input, sourceResult ? 'sourceResult' : 'body');
  knownFields(body, sourceResult ? INTERNAL_SOURCE_FIELDS : CREATE_FIELDS, sourceResult ? 'sourceResult' : 'body');
  for (const field of ['sourceRegistry', 'sourceReferenceId', 'documentType', 'summaryMethod']) {
    if (!Object.hasOwn(body, field)) invalid(field, `${field} is required.`);
  }
  const sourceRegistry = registry(body.sourceRegistry);
  if (expectedSourceName !== null && sourceRegistry !== expectedSourceName) {
    invalid('sourceRegistry', 'sourceRegistry does not match the configured source.');
  }
  const parsed = {
    sourceRegistry,
    sourceReferenceId: text(body.sourceReferenceId, 'sourceReferenceId', 200),
    applicationNumber: nullableText(body.applicationNumber, 'applicationNumber', 100),
    documentType: documentType(body.documentType),
    officeActionDate: nullableDate(body.officeActionDate, 'officeActionDate'),
    examinerName: nullableText(body.examinerName, 'examinerName', 200),
    examinerReasoningSummary: plainTextSummary(body.examinerReasoningSummary),
    summaryMethod: summaryMethod(body.summaryMethod),
    sourceDocumentUrl: sourceDocumentUrl(body.sourceDocumentUrl),
    sourceMetadata: parseOfficeActionSourceMetadata(body.sourceMetadata, { strict: !sourceResult }),
  };
  if (sourceResult) {
    parsed.markText = nullableText(body.markText, 'markText', 200);
    parsed.owner = nullableText(body.owner, 'owner', 200);
    parsed.jurisdiction = body.jurisdiction === null || body.jurisdiction === undefined
      ? null
      : registry(body.jurisdiction, 'jurisdiction');
  }
  return parsed;
}

export function parseOfficeActionRefCreate(input) {
  return parseCore(input);
}

export function parseOfficeActionRefPatch(input) {
  const body = plainObject(input, 'body');
  knownFields(body, PATCH_FIELDS, 'body');
  if (Object.keys(body).length === 0) invalid('body', 'PATCH body must contain at least one mutable field.');
  const parsed = {};
  for (const [field, value] of Object.entries(body)) {
    switch (field) {
      case 'applicationNumber': parsed.applicationNumber = nullableText(value, field, 100); break;
      case 'documentType': parsed.documentType = documentType(value, field); break;
      case 'officeActionDate': parsed.officeActionDate = nullableDate(value, field); break;
      case 'examinerName': parsed.examinerName = nullableText(value, field, 200); break;
      case 'examinerReasoningSummary': parsed.examinerReasoningSummary = plainTextSummary(value, field); break;
      case 'summaryMethod': parsed.summaryMethod = summaryMethod(value, field); break;
      case 'sourceDocumentUrl': parsed.sourceDocumentUrl = sourceDocumentUrl(value, field); break;
      case 'sourceMetadata': parsed.sourceMetadata = parseOfficeActionSourceMetadata(value); break;
      default: break;
    }
  }
  return parsed;
}

export function parseOfficeActionRefId(value, field = 'id') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field, `${field} must be a UUID.`);
  return value;
}

function queryScalar(value, field) {
  if (typeof value !== 'string') invalid(field, `${field} must be a scalar value.`);
  return value;
}

function queryCollection(value, field, parser, maximum = 10) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || values.length > maximum) invalid(field, `${field} may contain no more than ${maximum} values.`);
  return [...new Set(values.map((item) => parser(queryScalar(item, field), field)))];
}

function queryNumber(value, field, defaultValue, maximum) {
  if (value === undefined) return defaultValue;
  const normalized = queryScalar(value, field).trim();
  if (!/^\d+$/.test(normalized)) invalid(field, `${field} must be an integer.`);
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    invalid(field, `${field} must be between 1 and ${maximum}.`);
  }
  return number;
}

export function parseOfficeActionSearchQuery(query, { maximumResults = 25 } = {}) {
  const input = plainObject(query, 'query');
  const supported = new Set([
    'applicationNumber', 'markText', 'owner', 'filedFrom', 'filedTo', 'documentType',
    'jurisdiction', 'maxResults',
  ]);
  knownFields(input, supported, 'query');
  if (!Number.isSafeInteger(maximumResults) || maximumResults < 1 || maximumResults > 100) {
    throw new TypeError('maximumResults must be an integer between 1 and 100.');
  }
  const filedFrom = input.filedFrom === undefined ? null : parseCalendarDate(queryScalar(input.filedFrom, 'filedFrom'), 'filedFrom');
  const filedTo = input.filedTo === undefined ? null : parseCalendarDate(queryScalar(input.filedTo, 'filedTo'), 'filedTo');
  if (filedFrom && filedTo && filedFrom > filedTo) invalid('filedFrom', 'filedFrom must not be after filedTo.');
  const parsed = {
    applicationNumber: input.applicationNumber === undefined ? null : text(queryScalar(input.applicationNumber, 'applicationNumber'), 'applicationNumber', 100),
    markText: input.markText === undefined ? null : text(queryScalar(input.markText, 'markText'), 'markText', 200),
    owner: input.owner === undefined ? null : text(queryScalar(input.owner, 'owner'), 'owner', 200),
    filedFrom,
    filedTo,
    documentTypes: queryCollection(input.documentType, 'documentType', documentType),
    jurisdictions: queryCollection(input.jurisdiction, 'jurisdiction', registry),
    maxResults: queryNumber(input.maxResults, 'maxResults', maximumResults, maximumResults),
  };
  if (!parsed.applicationNumber && !parsed.markText && !parsed.owner
    && !parsed.filedFrom && !parsed.filedTo && parsed.documentTypes.length === 0 && parsed.jurisdictions.length === 0) {
    invalid('query', 'At least one Office Action search criterion is required.');
  }
  return parsed;
}

export function parseOfficeActionRefPagination(query) {
  const input = plainObject(query, 'query');
  knownFields(input, new Set(['page', 'pageSize']), 'query');
  return {
    page: queryNumber(input.page, 'page', 1, 100_000),
    pageSize: queryNumber(input.pageSize, 'pageSize', 25, 100),
  };
}

export function normalizeOfficeActionSourceResult(result, expectedSourceName) {
  return parseCore(result, { sourceResult: true, expectedSourceName: registry(expectedSourceName, 'sourceName') });
}
