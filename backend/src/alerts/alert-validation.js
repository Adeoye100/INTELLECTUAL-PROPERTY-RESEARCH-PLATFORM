import { badRequest } from '../errors.js';
import { UUID_PATTERN } from '../watch/watch-validation.js';

const STATUSES = new Set(['unread', 'read', 'dismissed']);
const SEVERITIES = new Set(['medium', 'high']);
const ACTIONS = new Set(['read', 'dismiss']);
const FILTERS = new Set(['page', 'pageSize', 'status', 'severity', 'watchId', 'portfolioMarkId', 'createdFrom', 'createdTo']);

function invalid(field, message) { throw badRequest('VALIDATION_ERROR', message, { field }); }
function scalar(value, field) { if (typeof value !== 'string') invalid(field, `${field} must be a scalar value.`); return value; }
function id(value, field) { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field, `${field} must be a UUID.`); return value; }
function date(value, field) {
  const raw = scalar(value, field).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00.000Z`))) invalid(field, `${field} must be a YYYY-MM-DD date.`);
  return `${raw}T00:00:00.000Z`;
}
function page(value, field, fallback, max) {
  if (value === undefined) return fallback;
  const raw = scalar(value, field).trim();
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) invalid(field, `${field} must be between 1 and ${max}.`);
  return Number(raw);
}

export function parseAlertId(value) { return id(value, 'id'); }
export function parseAlertFilters(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) invalid('query', 'query must be an object.');
  for (const key of Object.keys(query)) if (!FILTERS.has(key)) invalid(key, `${key} is not a supported filter.`);
  const status = query.status === undefined ? null : scalar(query.status, 'status').trim().toLowerCase();
  const severity = query.severity === undefined ? null : scalar(query.severity, 'severity').trim().toLowerCase();
  if (status && !STATUSES.has(status)) invalid('status', 'status must be unread, read, or dismissed.');
  if (severity && !SEVERITIES.has(severity)) invalid('severity', 'severity must be medium or high.');
  const createdFrom = query.createdFrom === undefined ? null : date(query.createdFrom, 'createdFrom');
  const createdTo = query.createdTo === undefined ? null : date(query.createdTo, 'createdTo');
  if (createdFrom && createdTo && createdFrom > createdTo) invalid('createdTo', 'createdFrom must not be after createdTo.');
  return {
    status, severity, watchId: query.watchId === undefined ? null : id(query.watchId, 'watchId'),
    portfolioMarkId: query.portfolioMarkId === undefined ? null : id(query.portfolioMarkId, 'portfolioMarkId'),
    createdFrom, createdTo,
  };
}
export function parseAlertPagination(query) { return { page: page(query.page, 'page', 1, 100_000), pageSize: page(query.pageSize, 'pageSize', 25, 100) }; }
export function parseAlertAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.action !== 'string' || !ACTIONS.has(input.action)) {
    invalid('body', 'body must be exactly { action: "read" } or { action: "dismiss" }.');
  }
  return input.action;
}
