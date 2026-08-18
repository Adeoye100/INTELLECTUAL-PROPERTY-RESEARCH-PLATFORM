import { badRequest } from '../errors.js';

const SUPPORTED_PARAMETERS = new Set([
  'mark', 'jurisdiction', 'class', 'status', 'owner', 'filedFrom', 'filedTo',
]);
const STATUSES = new Set(['pending', 'registered', 'abandoned']);

function invalid(field, message) {
  throw badRequest('VALIDATION_ERROR', message, { field });
}

function scalar(value, field) {
  if (typeof value !== 'string') invalid(field, `${field} must be a scalar value.`);
  return value;
}

function optionalScalar(query, field) {
  if (query[field] === undefined) return null;
  return scalar(query[field], field);
}

function parseCalendarDate(value, field) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    invalid(field, `${field} must be a valid YYYY-MM-DD date.`);
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    invalid(field, `${field} must be a valid YYYY-MM-DD date.`);
  }
  return trimmed;
}

function parseJurisdictions(value) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) return [];
  const normalized = values.map((entry) => {
    const jurisdiction = scalar(entry, 'jurisdiction').trim().toUpperCase();
    if (!jurisdiction) invalid('jurisdiction', 'jurisdiction values must not be empty.');
    return jurisdiction;
  });
  const unique = [...new Set(normalized)];
  if (unique.length > 10) invalid('jurisdiction', 'A maximum of 10 jurisdictions is allowed.');
  return unique;
}

function parseNiceClasses(value) {
  if (value === undefined) return [];
  const input = scalar(value, 'class').trim();
  if (!input) return [];
  if (!/^\d+(\s*,\s*\d+)*$/.test(input)) {
    invalid('class', 'class must contain comma-separated integers from 1 through 45.');
  }
  const classes = input.split(',').map((entry) => Number(entry.trim()));
  if (classes.some((niceClass) => niceClass < 1 || niceClass > 45)) {
    invalid('class', 'class values must be between 1 and 45.');
  }
  return [...new Set(classes)];
}

/** Parse and normalize the public GET /search query contract. */
export function parseSearchQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    invalid('query', 'Search query must be an object.');
  }
  for (const parameter of Object.keys(query)) {
    if (!SUPPORTED_PARAMETERS.has(parameter)) {
      invalid(parameter, `${parameter} is not a supported search parameter.`);
    }
  }

  const mark = scalar(query.mark, 'mark').trim();
  if (mark.length < 2 || mark.length > 200) {
    invalid('mark', 'mark must be between 2 and 200 characters.');
  }

  const jurisdictions = parseJurisdictions(query.jurisdiction);
  const niceClasses = parseNiceClasses(query.class);

  const statusValue = optionalScalar(query, 'status');
  const status = statusValue?.trim() || null;
  if (status !== null && !STATUSES.has(status)) {
    invalid('status', 'status must be pending, registered, or abandoned.');
  }

  const ownerValue = optionalScalar(query, 'owner');
  const owner = ownerValue?.trim() || null;
  if (owner !== null && owner.length > 200) invalid('owner', 'owner must be at most 200 characters.');

  const filedFromValue = optionalScalar(query, 'filedFrom');
  const filedToValue = optionalScalar(query, 'filedTo');
  const filedFrom = filedFromValue?.trim() || null;
  const filedTo = filedToValue?.trim() || null;
  const normalizedFiledFrom = filedFrom === null ? null : parseCalendarDate(filedFrom, 'filedFrom');
  const normalizedFiledTo = filedTo === null ? null : parseCalendarDate(filedTo, 'filedTo');
  if (normalizedFiledFrom && normalizedFiledTo && normalizedFiledFrom > normalizedFiledTo) {
    invalid('filedTo', 'filedFrom must not be after filedTo.');
  }

  return {
    mark,
    jurisdictions,
    niceClasses,
    status,
    owner,
    filedFrom: normalizedFiledFrom,
    filedTo: normalizedFiledTo,
  };
}
