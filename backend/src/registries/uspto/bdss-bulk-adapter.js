import unzipper from 'unzipper';
import {
  NotSupportedError,
  RegistryAdapter,
  RegistryHttpError,
  RegistryResponseSizeError,
} from '../registry-adapter.js';
import {
  limitReadableBytes,
  readBoundedJson,
  requestBoundedResponse,
  toNodeReadable,
} from '../bounded-response.js';
import { parseUsptoBulkXml } from './bulk-xml-parser.js';

const SOURCE_NAME = 'USPTO Bulk Data Storage System XML';
const DEFAULT_API_BASE_URL = 'https://bulkdata.uspto.gov/BDSS-API/products';
const DEFAULT_DAILY_PRODUCT = 'TRTDXFAP';
const DAILY_FILE_PATTERN = /^apc(\d{6})\.zip$/i;
const PRODUCT_PATTERN = /^[A-Z0-9_-]{1,50}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

function dateFromYymmdd(stamp) {
  const yy = Number(stamp.slice(0, 2));
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  const month = Number(stamp.slice(2, 4));
  const day = Number(stamp.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function startOfUtcDay(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError('discoverUpdates(since) requires a valid Date.');
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function safeBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('USPTO BDSS API base URL must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError('USPTO BDSS API base URL must be credential-free HTTPS on a non-loopback host.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function normalizeProduct(value) {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || !PRODUCT_PATTERN.test(normalized)) throw new TypeError('USPTO BDSS daily product is invalid.');
  return normalized;
}

function safeByteCount(value) {
  if (Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function safeDownloadUrl(value, trustedOrigin) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.origin !== trustedOrigin || url.username || url.password || url.hash) return null;
  return url.toString();
}

function downloadBasename(value) {
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean);
    const encoded = segments.at(-1) ?? '';
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function discoveryError(message) {
  const error = new Error(message);
  error.code = 'BULK_DISCOVERY_FAILED';
  return error;
}

export function parseBdssDailyFile(file, trustedOrigin) {
  if (!file || typeof file !== 'object') return null;
  const name = typeof file.fileName === 'string' ? file.fileName.trim() : '';
  const match = DAILY_FILE_PATTERN.exec(name);
  if (!match) return null;
  const date = dateFromYymmdd(match[1]);
  const url = safeDownloadUrl(file.fileDownloadUrl, trustedOrigin);
  if (!date || !url || downloadBasename(url) !== name) return null;
  return {
    kind: 'daily',
    fileName: name,
    date,
    expectedBytes: safeByteCount(file.fileSize),
    url,
  };
}

export function bdssDailyFiles(manifest, trustedOrigin) {
  const files = Array.isArray(manifest?.productFiles) ? manifest.productFiles : [];
  const firstByDate = new Map();
  for (const file of files) {
    const parsed = parseBdssDailyFile(file, trustedOrigin);
    if (!parsed) continue;
    const key = parsed.date.toISOString().slice(0, 10);
    if (!firstByDate.has(key)) firstByDate.set(key, parsed);
  }
  return [...firstByDate.values()].sort((left, right) => left.date - right.date);
}

function dateQuery(date, prefix) {
  return {
    [`${prefix}Year`]: String(date.getUTCFullYear()),
    [`${prefix}Month`]: String(date.getUTCMonth() + 1),
    [`${prefix}Day`]: String(date.getUTCDate()),
  };
}

async function consumeBoundedEntry(entry, {
  sourceName,
  maxBytes,
  abortController,
  onBytes,
}) {
  const bounded = limitReadableBytes(entry, {
    sourceName,
    operation: 'archive decompression',
    maxBytes,
    abortController,
    onBytes,
  });
  for await (const _chunk of bounded) { /* drain while enforcing the shared decompression budget */ }
}

export class UsptoBdssBulkXmlAdapter extends RegistryAdapter {
  constructor({
    baseUrl = DEFAULT_API_BASE_URL,
    dailyProduct = DEFAULT_DAILY_PRODUCT,
    fetchImpl = globalThis.fetch,
    clock = () => new Date(),
    maxManifestBytes = MAX_MANIFEST_BYTES,
    maxArchiveCompressedBytes = MAX_ARCHIVE_COMPRESSED_BYTES,
    maxArchiveDecompressedBytes = MAX_ARCHIVE_DECOMPRESSED_BYTES,
  } = {}) {
    super(SOURCE_NAME);
    if (typeof fetchImpl !== 'function') throw new TypeError('USPTO BDSS adapter needs fetch.');
    this.baseUrl = safeBaseUrl(baseUrl);
    this.trustedOrigin = this.baseUrl.origin;
    this.dailyProduct = normalizeProduct(dailyProduct);
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.maxManifestBytes = maxManifestBytes;
    this.maxArchiveCompressedBytes = maxArchiveCompressedBytes;
    this.maxArchiveDecompressedBytes = maxArchiveDecompressedBytes;
  }

  productUrl(since) {
    const to = startOfUtcDay(this.clock());
    const params = new URLSearchParams({
      ...dateQuery(startOfUtcDay(since), 'from'),
      ...dateQuery(to, 'to'),
    });
    return `${this.baseUrl.toString().replace(/\/$/, '')}/${encodeURIComponent(this.dailyProduct)}?${params}`;
  }

  async fetchManifest(since) {
    const request = await requestBoundedResponse({
      fetchImpl: this.fetchImpl,
      url: this.productUrl(since),
      sourceName: this.sourceName,
      operation: 'daily manifest discovery',
      accept: 'application/json',
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxCompressedBytes: this.maxManifestBytes,
      maxDecompressedBytes: this.maxManifestBytes,
    });
    if (!request.response.ok) {
      request.close();
      throw new RegistryHttpError(this.sourceName, 'daily manifest discovery', request.response.status);
    }
    return readBoundedJson(request, {
      sourceName: this.sourceName,
      operation: 'daily manifest discovery',
      maxBytes: this.maxManifestBytes,
    });
  }

  async discoverUpdates(since) {
    const firstDay = startOfUtcDay(since);
    const files = bdssDailyFiles(await this.fetchManifest(firstDay), this.trustedOrigin)
      .filter((entry) => entry.date >= firstDay);
    if (!files.length) {
      throw discoveryError(`${this.sourceName} manifest contained no valid apcYYMMDD.zip application archives.`);
    }
    return files;
  }

  async *parseArchive(readable, { abortController = null } = {}) {
    const archive = toNodeReadable(readable).pipe(unzipper.Parse({ forceStream: true }));
    let xmlEntries = 0;
    let decompressedBytes = 0;
    for await (const entry of archive) {
      const remaining = this.maxArchiveDecompressedBytes - decompressedBytes;
      if (remaining < 1) throw new RegistryResponseSizeError(this.sourceName, 'archive decompression');
      const onBytes = (size) => { decompressedBytes += size; };

      if (entry.type !== 'File') {
        entry.autodrain();
        continue;
      }
      if (!entry.path.toLowerCase().endsWith('.xml')) {
        await consumeBoundedEntry(entry, {
          sourceName: this.sourceName,
          maxBytes: remaining,
          abortController,
          onBytes,
        });
        continue;
      }

      xmlEntries += 1;
      const bounded = limitReadableBytes(entry, {
        sourceName: this.sourceName,
        operation: 'archive decompression',
        maxBytes: remaining,
        abortController,
        onBytes,
      });
      for await (const record of parseUsptoBulkXml(bounded)) yield record;
    }
    if (!xmlEntries) throw new Error(`${this.sourceName} ZIP contained no XML file.`);
  }

  async *fetchUpdate(update) {
    if (!update || typeof update.url !== 'string' || !(update.date instanceof Date) || Number.isNaN(update.date.getTime())) {
      throw new TypeError('fetchUpdate requires a valid update object with url and date.');
    }
    const url = safeDownloadUrl(update.url, this.trustedOrigin);
    if (!url) throw new Error(`${this.sourceName} archive URL must stay on the configured USPTO origin.`);
    if (typeof update.fileName === 'string' && downloadBasename(url) !== update.fileName) {
      throw new Error(`${this.sourceName} archive URL filename does not match the discovered archive metadata.`);
    }
    if (update.expectedBytes && update.expectedBytes > this.maxArchiveCompressedBytes) {
      throw new RegistryResponseSizeError(this.sourceName, 'daily archive download');
    }
    const request = await requestBoundedResponse({
      fetchImpl: this.fetchImpl,
      url,
      sourceName: this.sourceName,
      operation: 'daily archive download',
      accept: 'application/zip,application/octet-stream',
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      maxCompressedBytes: this.maxArchiveCompressedBytes,
      maxDecompressedBytes: this.maxArchiveCompressedBytes,
    });
    if (!request.response.ok) {
      request.close();
      throw new RegistryHttpError(this.sourceName, 'daily archive download', request.response.status);
    }
    try {
      yield* this.parseArchive(request.body);
    } finally {
      request.close();
    }
  }

  async *fetchUpdates(since) {
    for (const update of await this.discoverUpdates(since)) yield* this.fetchUpdate(update);
  }

  async getStatus(_referenceId) {
    throw new NotSupportedError('getStatus', this.sourceName, 'daily bulk files do not provide per-record lookups; use USPTO TSDR');
  }
}
