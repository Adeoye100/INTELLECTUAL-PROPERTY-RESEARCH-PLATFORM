import {
  DEFAULT_USPTO_ODP_ANNUAL_PRODUCT,
  DEFAULT_USPTO_ODP_API_BASE_URL,
  DEFAULT_USPTO_ODP_DAILY_PRODUCT,
} from './constants.js';

const PRODUCT_PATTERN = /^[A-Z0-9_-]{1,50}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function product(value, fallback, name) {
  const normalized = (value?.trim() || fallback).toUpperCase();
  if (!PRODUCT_PATTERN.test(normalized)) throw new Error(`${name} is invalid.`);
  return normalized;
}

function baseUrl(value) {
  let url;
  try { url = new URL(value?.trim() || DEFAULT_USPTO_ODP_API_BASE_URL); } catch {
    throw new Error('USPTO_ODP_API_BASE_URL must be a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('USPTO_ODP_API_BASE_URL must be credential-free HTTPS on a non-loopback host.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function loadUsptoBulkSourceConfig(env = process.env) {
  const source = (env.USPTO_BULK_SOURCE?.trim() || (env.USPTO_ODP_API_KEY?.trim() ? 'odp' : 'listing')).toLowerCase();
  if (!['odp', 'listing'].includes(source)) throw new Error('USPTO_BULK_SOURCE must be odp or listing.');
  if (source === 'listing') return { usptoBulkSource: 'listing' };

  const apiKey = env.USPTO_ODP_API_KEY?.trim();
  if (!apiKey) throw new Error('USPTO_ODP_API_KEY is required when USPTO_BULK_SOURCE=odp.');
  return {
    usptoBulkSource: 'odp',
    usptoOdpApiKey: apiKey,
    usptoOdpApiBaseUrl: baseUrl(env.USPTO_ODP_API_BASE_URL),
    usptoOdpAnnualProduct: product(env.USPTO_ODP_ANNUAL_PRODUCT, DEFAULT_USPTO_ODP_ANNUAL_PRODUCT, 'USPTO_ODP_ANNUAL_PRODUCT'),
    usptoOdpDailyProduct: product(env.USPTO_ODP_DAILY_PRODUCT, DEFAULT_USPTO_ODP_DAILY_PRODUCT, 'USPTO_ODP_DAILY_PRODUCT'),
  };
}
