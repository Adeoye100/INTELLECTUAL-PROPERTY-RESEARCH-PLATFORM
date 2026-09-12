import unzipper from 'unzipper';
import {
  NotSupportedError,
  RegistryAdapter,
  RegistryHttpError,
  RegistryResponseSizeError,
} from '../registry-adapter.js';
import {
  limitReadableBytes,
  limitResponseBody,
  readBoundedJson,
  toNodeReadable,
} from '../bounded-response.js';
import {
  DEFAULT_USPTO_ODP_ANNUAL_PRODUCT,
  DEFAULT_USPTO_ODP_API_BASE_URL,
  DEFAULT_USPTO_ODP_DAILY_PRODUCT,
  USPTO_ODP_BULK_SOURCE_NAME,
} from './constants.js';
import { parseUsptoBulkXml } from './bulk-xml-parser.js';

const DAILY_FILE_PATTERN = /^apc(\d{6})\.zip$/i;
const ANNUAL_FILE_PATTERN = /^apc(\d{8})-(\d{8})-(\d+)\.zip$/i;
const MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
const ARCHIVE_MAX_COMPRESSED_BYTES = 512 * 1024 * 1024;
const ARCHIVE_MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const MAX_REDIRECTS = 4;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function dateFromYymmdd(stamp) {
  const yy = Number(stamp.slice(0, 2));
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  const month = Number(stamp.slice(2, 4));
  const day = Number(stamp.slice(4, 6));
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return value;
}

function dateFromYyyymmdd(stamp) {
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(4, 6));
  const day = Number(stamp.slice(6, 8));
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return value;
}

function startOfUtcDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('discoverUpdates(since) requires a valid Date.');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normalizeProduct(value, name) {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || !/^[A-Z0-9_-]{1,50}$/.test(normalized)) throw new TypeError(`${name} is invalid.`);
  return normalized;
}

function safeBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('USPTO ODP API base URL must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError('USPTO ODP API base URL must be credential-free HTTPS on a non-loopback host.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function safeRedirectUrl(value, currentUrl) {
  let url;
  try { url = new URL(value, currentUrl); } catch { throw new Error('USPTO ODP returned an invalid download redirect.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('USPTO ODP download redirect must use credential-free HTTPS on a non-loopback host.');
  }
  return url;
}

function fileSize(value) {
  if (Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** Walk the defensive ODP manifest shape and return ZIP metadata. */
export function odpZipFiles(value) {
  const files = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const name = node.fileName ?? node.fileNameText;
    if (typeof name === 'string' && name.toLowerCase().endsWith('.zip')) {
      files.push({ name: name.trim(), size: fileSize(node.fileSize) });
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return [...new Map(files.map((entry) => [entry.name, entry])).values()];
}

export function parseOdpDailyFile(name) {
  const match = DAILY_FILE_PATTERN.exec(name);
  if (!match) return null;
  const date = dateFromYymmdd(match[1]);
  return date ? { name, date } : null;
}

export function parseOdpAnnualFile(name) {
  const match = ANNUAL_FILE_PATTERN.exec(name);
  if (!match) return null;
  const start = dateFromYyyymmdd(match[1]);
  const cutoff = dateFromYyyymmdd(match[2]);
  const part = Number(match[3]);
  if (!start || !cutoff || !Number.isSafeInteger(part) || part < 1) return null;
  return { name, start, cutoff, part };
}

function latestAnnualFiles(files) {
  const parsed = files.map((entry) => {
    const metadata = parseOdpAnnualFile(entry.name);
    return metadata ? { ...entry, ...metadata } : null;
  }).filter(Boolean);
  if (!parsed.length) throw new Error('USPTO ODP annual manifest contained no recognized apcYYYYMMDD-YYYYMMDD-PART.zip files.');
  const cutoffMs = Math.max(...parsed.map((entry) => entry.cutoff.getTime()));
  const parts = parsed.filter((entry) => entry.cutoff.getTime() === cutoffMs).sort((left, right) => left.part - right.part);
  return {
    start: parts.reduce((earliest, entry) => entry.start < earliest ? entry.start : earliest, parts[0].start),
    cutoff: new Date(cutoffMs),
    parts,
  };
}

export class UsptoOdpBulkXmlAdapter extends RegistryAdapter {
  constructor({
    apiKey,
    baseUrl = DEFAULT_USPTO_ODP_API_BASE_URL,
    annualProduct = DEFAULT_USPTO_ODP_ANNUAL_PRODUCT,
    dailyProduct = DEFAULT_USPTO_ODP_DAILY_PRODUCT,
    fetchImpl = globalThis.fetch,
    maxManifestBytes = MANIFEST_MAX_BYTES,
    maxArchiveCompressedBytes = ARCHIVE_MAX_COMPRESSED_BYTES,
    maxArchiveDecompressedBytes = ARCHIVE_MAX_DECOMPRESSED_BYTES,
  } = {}) {
    super(USPTO_ODP_BULK_SOURCE_NAME);
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new TypeError('USPTO ODP bulk adapter requires an API key.');
    if (typeof fetchImpl !== 'function') throw new TypeError('USPTO ODP bulk adapter needs fetch.');
    this.apiKey = apiKey.trim();
    this.baseUrl = safeBaseUrl(baseUrl);
    this.baseOrigin = this.baseUrl.origin;
    this.annualProduct = normalizeProduct(annualProduct, 'annualProduct');
    this.dailyProduct = normalizeProduct(dailyProduct, 'dailyProduct');
    this.fetchImpl = fetchImpl;
    this.maxManifestBytes = maxManifestBytes;
    this.maxArchiveCompressedBytes = maxArchiveCompressedBytes;
    this.maxArchiveDecompressedBytes = maxArchiveDecompressedBytes;
  }

  productUrl(product) {
    return `${this.baseUrl.toString().replace(/\/$/, '')}/${product.toLowerCase()}`;
  }

  fileUrl(product, fileName) {
    if (typeof fileName !== 'string' || !/^[A-Za-z0-9._-]{1,200}\.zip$/i.test(fileName)) {
      throw new TypeError('USPTO ODP file name is invalid.');
    }
    return `${this.baseUrl.toString().replace(/\/$/, '')}/files/${encodeURIComponent(product)}/${encodeURIComponent(fileName)}`;
  }

  async fetchManifest(product) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(this.productUrl(product), {
        headers: { Accept: 'application/json', 'x-api-key': this.apiKey },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new RegistryHttpError(this.sourceName, `${product} manifest`, response.status);
      const body = limitResponseBody(response, {
        sourceName: this.sourceName,
        operation: `${product} manifest`,
        maxCompressedBytes: this.maxManifestBytes,
        maxDecompressedBytes: this.maxManifestBytes,
        abortController: controller,
      });
      return await readBoundedJson({ response, body, close: () => clearTimeout(timeout) }, {
        sourceName: this.sourceName,
        operation: `${product} manifest`,
        maxBytes: this.maxManifestBytes,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async productFiles(product) {
    const files = odpZipFiles(await this.fetchManifest(product));
    if (!files.length) throw new Error(`USPTO ODP ${product} manifest contained no ZIP files.`);
    return files;
  }

  async discoverBaselineUpdates() {
    const annual = latestAnnualFiles(await this.productFiles(this.annualProduct));
    const dailyFiles = (await this.productFiles(this.dailyProduct))
      .map((entry) => {
        const parsed = parseOdpDailyFile(entry.name);
        return parsed ? { ...entry, ...parsed } : null;
      })
      .filter(Boolean)
      .filter((entry) => entry.date > annual.cutoff)
      .sort((left, right) => left.date - right.date);

    const annualUpdates = annual.parts.map((entry) => ({
      kind: 'annual',
      product: this.annualProduct,
      fileName: entry.name,
      date: annual.cutoff,
      expectedBytes: entry.size,
      url: this.fileUrl(this.annualProduct, entry.name),
    }));
    const dailyUpdates = dailyFiles.map((entry) => ({
      kind: 'daily',
      product: this.dailyProduct,
      fileName: entry.name,
      date: entry.date,
      expectedBytes: entry.size,
      url: this.fileUrl(this.dailyProduct, entry.name),
    }));
    return {
      coverageStart: annual.start,
      annualCutoff: annual.cutoff,
      updates: [...annualUpdates, ...dailyUpdates],
    };
  }

  async discoverUpdates(since) {
    const firstDay = startOfUtcDay(since);
    return (await this.productFiles(this.dailyProduct))
      .map((entry) => {
        const parsed = parseOdpDailyFile(entry.name);
        return parsed ? { ...entry, ...parsed } : null;
      })
      .filter(Boolean)
      .filter((entry) => entry.date >= firstDay)
      .sort((left, right) => left.date - right.date)
      .map((entry) => ({
        kind: 'daily',
        product: this.dailyProduct,
        fileName: entry.name,
        date: entry.date,
        expectedBytes: entry.size,
        url: this.fileUrl(this.dailyProduct, entry.name),
      }));
  }

  async openDownload(update) {
    let currentUrl = new URL(update.url);
    if (currentUrl.origin !== this.baseOrigin || !currentUrl.pathname.startsWith(`${this.baseUrl.pathname}/files/`)) {
      throw new Error('USPTO ODP archive URL must originate from the configured ODP API file endpoint.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const sendApiKey = currentUrl.origin === this.baseOrigin;
        const response = await this.fetchImpl(currentUrl.toString(), {
          headers: {
            Accept: 'application/zip,application/octet-stream',
            ...(sendApiKey ? { 'x-api-key': this.apiKey } : {}),
          },
          redirect: 'manual',
          signal: controller.signal,
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers?.get?.('location');
          if (!location || redirectCount === MAX_REDIRECTS) throw new Error('USPTO ODP archive redirect chain is invalid or too long.');
          currentUrl = safeRedirectUrl(location, currentUrl);
          continue;
        }
        if (!response.ok) throw new RegistryHttpError(this.sourceName, 'archive download', response.status);
        const body = limitResponseBody(response, {
          sourceName: this.sourceName,
          operation: 'archive download',
          maxCompressedBytes: this.maxArchiveCompressedBytes,
          maxDecompressedBytes: this.maxArchiveCompressedBytes,
          abortController: controller,
        });
        return { response, body, close: () => { clearTimeout(timeout); controller.abort(); } };
      }
      throw new Error('USPTO ODP archive redirect chain exceeded the configured limit.');
    } catch (error) {
      clearTimeout(timeout);
      controller.abort();
      throw error;
    }
  }

  async *parseArchive(readable, { abortController = null } = {}) {
    const archive = toNodeReadable(readable).pipe(unzipper.Parse({ forceStream: true }));
    let xmlEntries = 0;
    let decompressedBytes = 0;
    for await (const entry of archive) {
      if (entry.type !== 'File' || !entry.path.toLowerCase().endsWith('.xml')) {
        entry.autodrain();
        continue;
      }
      xmlEntries += 1;
      const remaining = this.maxArchiveDecompressedBytes - decompressedBytes;
      if (remaining < 1) throw new RegistryResponseSizeError(this.sourceName, 'archive decompression');
      const boundedEntry = limitReadableBytes(entry, {
        sourceName: this.sourceName,
        operation: 'archive decompression',
        maxBytes: remaining,
        abortController,
        onBytes: (size) => { decompressedBytes += size; },
      });
      for await (const record of parseUsptoBulkXml(boundedEntry)) yield record;
    }
    if (!xmlEntries) throw new Error(`${this.sourceName} ZIP contained no XML file.`);
  }

  async *fetchUpdate(update) {
    if (!update || typeof update.url !== 'string' || typeof update.product !== 'string'
      || typeof update.fileName !== 'string' || !(update.date instanceof Date) || Number.isNaN(update.date.getTime())) {
      throw new TypeError('fetchUpdate requires a valid ODP update object.');
    }
    const request = await this.openDownload(update);
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
    throw new NotSupportedError('getStatus', this.sourceName, 'bulk files do not provide per-record lookups; use USPTO TSDR');
  }
}
