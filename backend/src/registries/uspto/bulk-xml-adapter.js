import unzipper from 'unzipper';
import {
  NotSupportedError,
  RegistryAdapter,
  RegistryHttpError,
  RegistryResponseSizeError,
} from '../registry-adapter.js';
import {
  DEFAULT_USPTO_BULK_LISTING_URL,
  USPTO_BULK_SOURCE_NAME,
} from './constants.js';
import { parseUsptoBulkXml } from './bulk-xml-parser.js';
import {
  DEFAULT_MAX_REGISTRY_COMPRESSED_BYTES,
  DEFAULT_MAX_REGISTRY_DECOMPRESSED_BYTES,
  limitReadableBytes,
  readBoundedText,
  requestBoundedResponse,
  toNodeReadable,
} from '../bounded-response.js';

const DAILY_FILE_PATTERN = /href\s*=\s*["']([^"']*apc(\d{6})\.zip(?:\?[^"']*)?)["']/gi;
const REGISTRY_TIMEOUT_MS = 30_000;
const MAX_LISTING_BYTES = 1 * 1024 * 1024;

function dateFromFileStamp(stamp) {
  const year = 2000 + Number(stamp.slice(0, 2));
  const month = Number(stamp.slice(2, 4));
  const day = Number(stamp.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function startOfUtcDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('fetchUpdates(since) requires a valid Date.');
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dailyFileLinks(listingHtml, listingUrl) {
  const links = [];
  for (const match of listingHtml.matchAll(DAILY_FILE_PATTERN)) {
    const date = dateFromFileStamp(match[2]);
    if (date) links.push({ date, url: new URL(match[1], listingUrl).toString() });
  }
  return [...new Map(links.map((link) => [link.url, link])).values()]
    .sort((left, right) => left.date - right.date);
}

export class UsptoBulkXmlAdapter extends RegistryAdapter {
  constructor({
    listingUrl = DEFAULT_USPTO_BULK_LISTING_URL,
    fetchImpl = globalThis.fetch,
    maxListingBytes = MAX_LISTING_BYTES,
    maxArchiveCompressedBytes = DEFAULT_MAX_REGISTRY_COMPRESSED_BYTES,
    maxArchiveDecompressedBytes = DEFAULT_MAX_REGISTRY_DECOMPRESSED_BYTES,
  } = {}) {
    super(USPTO_BULK_SOURCE_NAME);
    let parsed;
    try { parsed = new URL(listingUrl); } catch { throw new TypeError('USPTO bulk listing URL must be a valid HTTP(S) URL.'); }
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    if (!['http:', 'https:'].includes(parsed.protocol) || (parsed.protocol !== 'https:' && !loopback)
      || parsed.username || parsed.password || parsed.hash) {
      throw new TypeError('USPTO bulk listing URL must use credential-free HTTPS except for loopback testing.');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('USPTO bulk adapter needs fetch.');
    this.listingUrl = parsed.toString();
    this.listingOrigin = parsed.origin;
    this.fetchImpl = fetchImpl;
    for (const [name, value] of Object.entries({ maxListingBytes, maxArchiveCompressedBytes, maxArchiveDecompressedBytes })) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 512 * 1024 * 1024) throw new TypeError(`${name} must be a bounded positive byte count.`);
    }
    this.maxListingBytes = maxListingBytes;
    this.maxArchiveCompressedBytes = maxArchiveCompressedBytes;
    this.maxArchiveDecompressedBytes = maxArchiveDecompressedBytes;
  }

  async discoverUpdates(since) {
    const request = await requestBoundedResponse({
      fetchImpl: this.fetchImpl, url: this.listingUrl, sourceName: this.sourceName,
      operation: 'daily-file discovery', accept: 'text/html,application/xhtml+xml', timeoutMs: REGISTRY_TIMEOUT_MS,
      maxCompressedBytes: this.maxListingBytes, maxDecompressedBytes: this.maxListingBytes,
    });
    if (!request.response.ok) {
      request.close();
      throw new RegistryHttpError(this.sourceName, 'daily-file discovery', request.response.status);
    }
    const links = dailyFileLinks(await readBoundedText(request, {
      maxBytes: this.maxListingBytes, sourceName: this.sourceName, operation: 'daily-file discovery',
    }), this.listingUrl)
      // A listing is upstream input. Archive URLs must remain on the explicit
      // configured listing origin, never become arbitrary fetch destinations.
      .filter((link) => new URL(link.url).origin === this.listingOrigin);
    if (!links.length) {
      throw new Error(
        `${this.sourceName} listing contained no apcYYMMDD.zip links; `
        + 'verify USPTO_BULK_LISTING_URL and upstream access.',
      );
    }
    const firstDay = startOfUtcDay(since);
    return links.filter(({ date }) => date >= firstDay);
  }

  async *parseArchive(readable, { abortController = null } = {}) {
    const archive = toNodeReadable(readable).pipe(unzipper.Parse({ forceStream: true }));
    let xmlEntries = 0;
    let decompressedBytes = 0;
    const records = [];
    for await (const entry of archive) {
      if (entry.type !== 'File' || !entry.path.toLowerCase().endsWith('.xml')) {
        entry.autodrain();
        continue;
      }
      xmlEntries += 1;
      const remaining = this.maxArchiveDecompressedBytes - decompressedBytes;
      if (remaining < 1) throw new RegistryResponseSizeError(this.sourceName, 'daily archive decompression');
      const boundedEntry = limitReadableBytes(entry, {
        sourceName: this.sourceName, operation: 'daily archive decompression', maxBytes: remaining, abortController,
        onBytes: (size) => { decompressedBytes += size; },
      });
      for await (const record of parseUsptoBulkXml(boundedEntry)) records.push(record);
    }
    if (!xmlEntries) throw new Error(`${this.sourceName} ZIP contained no XML file.`);
    // Do not expose partially parsed archive data if a later entry violates a
    // size bound or fails decompression.
    yield* records;
  }

  async *fetchUpdates(since) {
    const updates = await this.discoverUpdates(since);
    for (const update of updates) {
      const request = await requestBoundedResponse({
        fetchImpl: this.fetchImpl, url: update.url, sourceName: this.sourceName,
        operation: 'daily archive download', accept: 'application/zip,application/octet-stream', timeoutMs: REGISTRY_TIMEOUT_MS,
        maxCompressedBytes: this.maxArchiveCompressedBytes, maxDecompressedBytes: this.maxArchiveCompressedBytes,
      });
      if (!request.response.ok) {
        request.close();
        throw new RegistryHttpError(this.sourceName, 'daily archive download', request.response.status);
      }
      try {
        yield* this.parseArchive(request.body);
      } finally { request.close(); }
    }
  }

  async getStatus(_referenceId) {
    throw new NotSupportedError(
      'getStatus',
      this.sourceName,
      'daily bulk files do not provide per-record lookups; use USPTO TSDR',
    );
  }
}
