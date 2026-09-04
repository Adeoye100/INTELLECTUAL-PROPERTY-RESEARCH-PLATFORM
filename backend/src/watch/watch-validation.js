import { badRequest } from '../errors.js';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WATCH_STATES = new Set(['enabled', 'paused']);
const CREATE_FIELDS = new Set(['portfolioMarkId', 'state', 'active', 'alertChannel', 'alertMode', 'pollIntervalMinutes']);
const PATCH_FIELDS = new Set(['state', 'active', 'alertChannel', 'alertMode', 'pollIntervalMinutes']);
const FILTER_FIELDS = new Set(['page', 'pageSize', 'state', 'portfolioMarkId']);

function invalid(field, message) {
  throw badRequest('VALIDATION_ERROR', message, { field });
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field, `${field} must be an object.`);
  return value;
}

function uuid(value, field) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field, `${field} must be a UUID.`);
  return value;
}

function state(value, field = 'state') {
  if (typeof value !== 'string' || !WATCH_STATES.has(value.trim().toLowerCase())) {
    invalid(field, 'state must be enabled or paused.');
  }
  return value.trim().toLowerCase();
}

function alertChannel(value, field = 'alertChannel') {
  if (typeof value !== 'string' || !['email', 'in-app'].includes(value.trim().toLowerCase())) {
    invalid(field, 'alertChannel must be email or in-app.');
  }
  return value.trim().toLowerCase();
}

function alertMode(value, field = 'alertMode') {
  if (typeof value !== 'string' || !['real-time', 'digest'].includes(value.trim().toLowerCase())) {
    invalid(field, 'alertMode must be real-time or digest.');
  }
  return value.trim().toLowerCase();
}

function interval(value, field = 'pollIntervalMinutes') {
  if (!Number.isSafeInteger(value) || value < 5 || value > 43_200) {
    invalid(field, 'pollIntervalMinutes must be an integer from 5 through 43200.');
  }
  return value;
}

function known(input, allowed) {
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) invalid(field, `${field} is not supported.`);
  }
}

function scalar(value, field) {
  if (typeof value !== 'string') invalid(field, `${field} must be a scalar value.`);
  return value;
}

function positiveQueryInteger(value, field, fallback, maximum) {
  if (value === undefined) return fallback;
  const raw = scalar(value, field).trim();
  if (!/^\d+$/.test(raw)) invalid(field, `${field} must be an integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    invalid(field, `${field} must be between 1 and ${maximum}.`);
  }
  return parsed;
}

export function parseWatchCreate(input, defaultPollIntervalMinutes) {
  const body = object(input, 'body');
  known(body, CREATE_FIELDS);
  if (!Object.hasOwn(body, 'portfolioMarkId')) invalid('portfolioMarkId', 'portfolioMarkId is required.');

  let watchState = 'enabled';
  if (body.state !== undefined) {
    watchState = state(body.state);
  } else if (body.active !== undefined) {
    watchState = body.active ? 'enabled' : 'paused';
  }

  return {
    portfolioMarkId: uuid(body.portfolioMarkId, 'portfolioMarkId'),
    state: watchState,
    alertChannel: body.alertChannel === undefined ? 'in-app' : alertChannel(body.alertChannel),
    alertMode: body.alertMode === undefined ? 'real-time' : alertMode(body.alertMode),
    pollIntervalMinutes: body.pollIntervalMinutes === undefined
      ? interval(defaultPollIntervalMinutes) : interval(body.pollIntervalMinutes),
  };
}

export function parseWatchPatch(input) {
  const body = object(input, 'body');
  known(body, PATCH_FIELDS);
  if (Object.keys(body).length === 0) invalid('body', 'PATCH body must contain at least one mutable field.');
  const parsed = {};
  if (Object.hasOwn(body, 'state')) parsed.state = state(body.state);
  if (Object.hasOwn(body, 'active')) parsed.state = body.active ? 'enabled' : 'paused';
  if (Object.hasOwn(body, 'alertChannel')) parsed.alertChannel = alertChannel(body.alertChannel);
  if (Object.hasOwn(body, 'alertMode')) parsed.alertMode = alertMode(body.alertMode);
  if (Object.hasOwn(body, 'pollIntervalMinutes')) parsed.pollIntervalMinutes = interval(body.pollIntervalMinutes);
  return parsed;
}

export function parseWatchId(value) {
  return uuid(value, 'id');
}

export function parseWatchFilters(query) {
  const input = object(query, 'query');
  known(input, FILTER_FIELDS);
  return {
    state: input.state === undefined ? null : state(scalar(input.state, 'state')),
    portfolioMarkId: input.portfolioMarkId === undefined
      ? null : uuid(scalar(input.portfolioMarkId, 'portfolioMarkId'), 'portfolioMarkId'),
  };
}

export function parseWatchPagination(query) {
  return {
    page: positiveQueryInteger(query.page, 'page', 1, 100_000),
    pageSize: positiveQueryInteger(query.pageSize, 'pageSize', 25, 100),
  };
}
