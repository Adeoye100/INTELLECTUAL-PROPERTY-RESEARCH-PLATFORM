import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NotSupportedError } from '../../src/registries/registry-adapter.js';
import {
  UsptoBulkXmlAdapter,
  dailyFileLinks,
} from '../../src/registries/uspto/bulk-xml-adapter.js';
import { parseUsptoBulkXml } from '../../src/registries/uspto/bulk-xml-parser.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(directory, '../fixtures/uspto/apc260105-verified-excerpt.xml');

async function collect(iterable) {
  const records = [];
  for await (const record of iterable) records.push(record);
  return records;
}

function response(body, { status = 200, contentLength = null, location = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-length') return contentLength;
        if (name.toLowerCase() === 'location') return location;
        return null;
      },
    },
    body: Readable.from([Buffer.from(body)]),
  };
}

describe('USPTO Bulk XML adapter', () => {
  it('parses verified DTD v2.0 paths and does not confuse classification status', async () => {
    const records = await collect(parseUsptoBulkXml(createReadStream(fixture)));
    assert.deepEqual(records, [
      {
        sourceReferenceId: '98038829',
        markText: 'NIMBL VISUAL MEDIA & DESIGN',
        owner: 'Nimbl Marketing Co.',
        jurisdiction: 'US',
        niceClasses: [35, 41, 42],
        status: 'registered',
        rawStatusCode: '700',
        filingDate: '2023-06-12',
        sourceRegistry: 'USPTO',
        sourceUpdatedAt: '2026-01-05',
      },
      {
        sourceReferenceId: '79373454',
        markText: 'VALORIA',
        owner: 'Aphea.Bio, naamloze vennootschap',
        jurisdiction: 'US',
        niceClasses: [1, 5],
        status: 'abandoned',
        rawStatusCode: '602',
        filingDate: '2023-06-06',
        sourceRegistry: 'USPTO',
        sourceUpdatedAt: '2026-01-05',
      },
    ]);
  });

  it('discovers and sorts actual apcYYMMDD link names', () => {
    const links = dailyFileLinks(`
      <a href="files/apc260105.zip">January 5</a>
      <a href="https://cdn.example.test/apc260103.zip">January 3</a>
    `, 'https://trademarks.reedtech.com/tmappxml.php');
    assert.deepEqual(links.map(({ url }) => url), [
      'https://cdn.example.test/apc260103.zip',
      'https://trademarks.reedtech.com/files/apc260105.zip',
    ]);
  });

  it('discovers daily archive names rendered in form and script markup', () => {
    const links = dailyFileLinks(`
      <option value="downloads/apc260106.zip">January 6</option>
      <script>downloadFile('apc260107.zip')</script>
      <div data-file="archive/apc260108.zip?download=1"></div>
    `, 'https://trademarks.reedtech.com/tmappxml.php');
    assert.deepEqual(links.map(({ url }) => url), [
      'https://trademarks.reedtech.com/downloads/apc260106.zip',
      'https://trademarks.reedtech.com/apc260107.zip',
      'https://trademarks.reedtech.com/archive/apc260108.zip?download=1',
    ]);
  });

  it('prefers same-origin download handlers when archive names are link labels', () => {
    const links = dailyFileLinks(`
      <a href="download.php?id=106">apc260106.zip</a>
      <option value="download.php?id=107">apc260107.zip</option>
    `, 'https://trademarks.reedtech.com/tmappxml.php');
    assert.deepEqual(links.map(({ url }) => url), [
      'https://trademarks.reedtech.com/download.php?id=106',
      'https://trademarks.reedtech.com/download.php?id=107',
    ]);
  });

  it('downloads only listing entries on or after since', async () => {
    const calls = [];
    const adapter = new UsptoBulkXmlAdapter({
      listingUrl: 'https://example.test/listing',
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.endsWith('/listing')) return response('<a href="apc260104.zip">old</a><a href="apc260105.zip">new</a>');
        return response('test archive');
      },
    });
    adapter.parseArchive = async function* parseArchive() { yield { sourceReferenceId: '98038829' }; };
    assert.deepEqual(
      await collect(adapter.fetchUpdates(new Date('2026-01-05T12:00:00Z'))),
      [{ sourceReferenceId: '98038829' }],
    );
    assert.deepEqual(calls, [
      'https://example.test/listing',
      'https://example.test/apc260105.zip',
    ]);
  });

  it('allows bounded same-origin canonicalization redirects for the public listing', async () => {
    const calls = [];
    const adapter = new UsptoBulkXmlAdapter({
      listingUrl: 'https://registry.example.test/applications',
      fetchImpl: async (url, options) => {
        calls.push({ url, redirect: options?.redirect });
        if (url.endsWith('/applications')) {
          return response('', { status: 301, location: '/applications/' });
        }
        return response('<a href="apc260105.zip">daily</a>');
      },
    });

    const updates = await adapter.discoverUpdates(new Date('2026-01-05T00:00:00.000Z'));
    assert.equal(updates.length, 1);
    assert.equal(updates[0].url, 'https://registry.example.test/applications/apc260105.zip');
    assert.deepEqual(calls, [
      { url: 'https://registry.example.test/applications', redirect: 'manual' },
      { url: 'https://registry.example.test/applications/', redirect: 'manual' },
    ]);
  });

  it('rejects a cross-origin redirect from the public listing', async () => {
    const adapter = new UsptoBulkXmlAdapter({
      listingUrl: 'https://registry.example.test/applications',
      fetchImpl: async () => response('', { status: 302, location: 'https://unexpected.example.test/listing' }),
    });
    await assert.rejects(
      adapter.discoverUpdates(new Date('2026-01-05T00:00:00.000Z')),
      /redirect left the trusted origin/,
    );
  });

  it('does not follow a cross-origin archive URL discovered in an upstream listing', async () => {
    const calls = [];
    const adapter = new UsptoBulkXmlAdapter({
      listingUrl: 'https://registry.example.test/listing',
      fetchImpl: async (url) => {
        calls.push(url);
        return response('<a href="https://unexpected.example.test/apc260105.zip">archive</a>');
      },
    });
    await assert.rejects(
      adapter.discoverUpdates(new Date('2026-01-05T00:00:00.000Z')),
      /contained no apcYYMMDD.zip links/,
    );
    assert.deepEqual(calls, ['https://registry.example.test/listing']);
  });

  it('honestly rejects per-record status lookup', async () => {
    const adapter = new UsptoBulkXmlAdapter();
    await assert.rejects(
      adapter.getStatus('98038829'),
      (error) => error instanceof NotSupportedError
        && error.code === 'REGISTRY_OPERATION_NOT_SUPPORTED'
        && /use USPTO TSDR/.test(error.message),
    );
  });
});
