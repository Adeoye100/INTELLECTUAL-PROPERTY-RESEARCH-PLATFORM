import { Readable } from 'node:stream';
import unzipper from 'unzipper';
import {
  NotSupportedError,
  RegistryAdapter,
  RegistryHttpError,
} from '../registry-adapter.js';
import {
  DEFAULT_USPTO_BULK_LISTING_URL,
  USPTO_BULK_SOURCE_NAME,
} from './constants.js';
import { parseUsptoBulkXml } from './bulk-xml-parser.js';

const DAILY_FILE_PATTERN = /href\s*=\s*["']([^"']*apc(\d{6})\.zip(?:\?[^"']*)?)["']/gi;
const REGISTRY_TIMEOUT_MS = 30_000;

function toNodeReadable(body) {
  if (!body) throw new Error('USPTO response did not contain a body.');
  return typeof body.pipe === 'function' ? body : Readable.fromWeb(body);
}

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
  }

  async discoverUpdates(since) {
    const response = await this.fetchImpl(this.listingUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      redirect: 'error',
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new RegistryHttpError(this.sourceName, 'daily-file discovery', response.status);
    }
    const links = dailyFileLinks(await response.text(), this.listingUrl)
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

  async *parseArchive(readable) {
    const archive = toNodeReadable(readable).pipe(unzipper.Parse({ forceStream: true }));
    let xmlEntries = 0;
    for await (const entry of archive) {
      if (entry.type !== 'File' || !entry.path.toLowerCase().endsWith('.xml')) {
        entry.autodrain();
        continue;
      }
      xmlEntries += 1;
      yield* parseUsptoBulkXml(entry);
    }
    if (!xmlEntries) throw new Error(`${this.sourceName} ZIP contained no XML file.`);
  }

  async *fetchUpdates(since) {
    const updates = await this.discoverUpdates(since);
    for (const update of updates) {
      const response = await this.fetchImpl(update.url, {
        headers: { Accept: 'application/zip,application/octet-stream' },
        redirect: 'error',
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new RegistryHttpError(this.sourceName, 'daily archive download', response.status);
      }
      yield* this.parseArchive(response.body);
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
