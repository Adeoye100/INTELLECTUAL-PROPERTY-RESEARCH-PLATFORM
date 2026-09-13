import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import {
  UsptoBdssBulkXmlAdapter,
  bdssDailyFiles,
  parseBdssDailyFile,
} from '../../src/registries/uspto/bdss-bulk-adapter.js';
import { loadUsptoBulkSourceConfig } from '../../src/registries/uspto/odp-config.js';

function response(body, { status = 200, headers = {} } = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return normalized.get(name.toLowerCase()) ?? null; } },
    body: Readable.from([Buffer.from(payload)]),
  };
}

describe('USPTO BDSS bulk XML adapter', () => {
  it('parses only trusted daily application ZIP metadata', () => {
    const trustedOrigin = 'https://bulkdata.uspto.gov';
    assert.deepEqual(parseBdssDailyFile({
      fileName: 'apc260911.zip',
      fileSize: 123,
      fileDownloadUrl: 'https://bulkdata.uspto.gov/data3/trademark/dailyxml/applications/2026/apc260911.zip',
    }, trustedOrigin), {
      kind: 'daily',
      fileName: 'apc260911.zip',
      date: new Date('2026-09-11T00:00:00.000Z'),
      expectedBytes: 123,
      url: 'https://bulkdata.uspto.gov/data3/trademark/dailyxml/applications/2026/apc260911.zip',
    });

    assert.equal(parseBdssDailyFile({
      fileName: 'asb260911.zip',
      fileDownloadUrl: 'https://bulkdata.uspto.gov/data3/trademark/assignment/asb260911.zip',
    }, trustedOrigin), null);
    assert.equal(parseBdssDailyFile({
      fileName: 'apc260911.zip',
      fileDownloadUrl: 'https://evil.example/apc260911.zip',
    }, trustedOrigin), null);
  });

  it('deduplicates archive dates and sorts them chronologically', () => {
    const manifest = {
      productFiles: [
        { fileName: 'apc260912.zip', fileSize: 12, fileDownloadUrl: 'https://bulkdata.uspto.gov/data/apc260912.zip' },
        { fileName: 'apc260911.zip', fileSize: 11, fileDownloadUrl: 'https://bulkdata.uspto.gov/data/apc260911.zip' },
        { fileName: 'apc260911.zip', fileSize: 99, fileDownloadUrl: 'https://bulkdata.uspto.gov/data/duplicate-apc260911.zip' },
        { fileName: 'ttab260911.zip', fileSize: 4, fileDownloadUrl: 'https://bulkdata.uspto.gov/data/ttab260911.zip' },
      ],
    };
    assert.deepEqual(
      bdssDailyFiles(manifest, 'https://bulkdata.uspto.gov').map((entry) => entry.fileName),
      ['apc260911.zip', 'apc260912.zip'],
    );
  });

  it('requests the public BDSS product with bounded date parameters and no API key', async () => {
    const calls = [];
    const adapter = new UsptoBdssBulkXmlAdapter({
      clock: () => new Date('2026-09-13T12:00:00.000Z'),
      fetchImpl: async (url, options) => {
        calls.push({ url, headers: options.headers });
        return response({
          productShortName: 'TRTDXFAP',
          productFiles: [
            {
              fileName: 'apc260912.zip',
              fileSize: 10,
              fileDownloadUrl: 'https://bulkdata.uspto.gov/data3/trademark/dailyxml/applications/2026/apc260912.zip',
            },
          ],
        });
      },
    });

    const updates = await adapter.discoverUpdates(new Date('2026-09-10T18:30:00.000Z'));
    assert.equal(updates.length, 1);
    const requested = new URL(calls[0].url);
    assert.equal(requested.pathname, '/BDSS-API/products/TRTDXFAP');
    assert.equal(requested.searchParams.get('fromYear'), '2026');
    assert.equal(requested.searchParams.get('fromMonth'), '9');
    assert.equal(requested.searchParams.get('fromDay'), '10');
    assert.equal(requested.searchParams.get('toYear'), '2026');
    assert.equal(requested.searchParams.get('toMonth'), '9');
    assert.equal(requested.searchParams.get('toDay'), '13');
    assert.equal(calls[0].headers['x-api-key'], undefined);
  });

  it('rejects manifests without usable daily application archives', async () => {
    const adapter = new UsptoBdssBulkXmlAdapter({
      fetchImpl: async () => response({ productFiles: [{
        fileName: 'readme.txt',
        fileDownloadUrl: 'https://bulkdata.uspto.gov/readme.txt',
      }] }),
    });
    await assert.rejects(
      adapter.discoverUpdates(new Date('2026-09-10T00:00:00.000Z')),
      /no valid apcYYMMDD\.zip application archives/,
    );
  });

  it('rejects a cross-origin archive before any download is attempted', async () => {
    let called = false;
    const adapter = new UsptoBdssBulkXmlAdapter({
      fetchImpl: async () => { called = true; return response('unexpected'); },
    });
    await assert.rejects(
      async () => {
        for await (const _record of adapter.fetchUpdate({
          fileName: 'apc260911.zip',
          date: new Date('2026-09-11T00:00:00.000Z'),
          url: 'https://evil.example/apc260911.zip',
        })) { /* no-op */ }
      },
      /must stay on the configured USPTO origin/,
    );
    assert.equal(called, false);
  });

  it('loads keyless BDSS source configuration without credentials', () => {
    assert.deepEqual(loadUsptoBulkSourceConfig({ USPTO_BULK_SOURCE: 'bdss' }), {
      usptoBulkSource: 'bdss',
      usptoBdssApiBaseUrl: 'https://bulkdata.uspto.gov/BDSS-API/products',
      usptoBdssDailyProduct: 'TRTDXFAP',
    });
  });
});
