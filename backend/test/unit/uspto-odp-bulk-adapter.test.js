import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import {
  UsptoOdpBulkXmlAdapter,
  odpZipFiles,
  parseOdpAnnualFile,
  parseOdpDailyFile,
} from '../../src/registries/uspto/odp-bulk-adapter.js';
import { loadUsptoBulkSourceConfig } from '../../src/registries/uspto/odp-config.js';

function response(body, { status = 200, headers = {}, url = '' } = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  const value = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get(name) { return normalized.get(name.toLowerCase()) ?? null; } },
    body: Readable.from([Buffer.from(value)]),
  };
}

describe('USPTO ODP bulk XML adapter', () => {
  it('walks the defensive manifest shape and keeps ZIP metadata only once', () => {
    const manifest = {
      bulkDataProductBag: [{
        productFileBag: {
          fileDataBag: [
            { fileName: 'apc260901.zip', fileSize: 101 },
            { fileName: 'apc260901.zip', fileSize: 101 },
            { fileName: 'readme.txt', fileSize: 5 },
          ],
        },
      }],
    };
    assert.deepEqual(odpZipFiles(manifest), [{ name: 'apc260901.zip', size: 101 }]);
  });

  it('parses current ODP annual and daily trademark filenames', () => {
    const annual = parseOdpAnnualFile('apc18840407-20241231-03.zip');
    assert.equal(annual.start.toISOString().slice(0, 10), '1884-04-07');
    assert.equal(annual.cutoff.toISOString().slice(0, 10), '2024-12-31');
    assert.equal(annual.part, 3);
    assert.equal(parseOdpDailyFile('apc260911.zip').date.toISOString().slice(0, 10), '2026-09-11');
    assert.equal(parseOdpDailyFile('not-a-daily.zip'), null);
  });

  it('builds a complete latest-annual baseline followed only by newer dailies', async () => {
    const calls = [];
    const annualManifest = {
      bulkDataProductBag: [{ productFileBag: { fileDataBag: [
        { fileName: 'apc18840407-20231231-01.zip', fileSize: 50 },
        { fileName: 'apc18840407-20241231-02.zip', fileSize: 60 },
        { fileName: 'apc18840407-20241231-01.zip', fileSize: 55 },
      ] } }],
    };
    const dailyManifest = {
      bulkDataProductBag: [{ productFileBag: { fileDataBag: [
        { fileName: 'apc241231.zip', fileSize: 10 },
        { fileName: 'apc250101.zip', fileSize: 11 },
        { fileName: 'apc250102.zip', fileSize: 12 },
      ] } }],
    };
    const adapter = new UsptoOdpBulkXmlAdapter({
      apiKey: 'test-key',
      fetchImpl: async (url, options) => {
        calls.push([url, options.headers['x-api-key']]);
        if (url.endsWith('/trtyrap')) return response(annualManifest);
        if (url.endsWith('/trtdxfap')) return response(dailyManifest);
        throw new Error(`unexpected URL ${url}`);
      },
    });

    const baseline = await adapter.discoverBaselineUpdates();
    assert.equal(baseline.coverageStart.toISOString().slice(0, 10), '1884-04-07');
    assert.equal(baseline.annualCutoff.toISOString().slice(0, 10), '2024-12-31');
    assert.deepEqual(baseline.updates.map((item) => item.fileName), [
      'apc18840407-20241231-01.zip',
      'apc18840407-20241231-02.zip',
      'apc250101.zip',
      'apc250102.zip',
    ]);
    assert.deepEqual(calls.map((entry) => entry[1]), ['test-key', 'test-key']);
  });

  it('discovers incremental daily files from the requested UTC date', async () => {
    const adapter = new UsptoOdpBulkXmlAdapter({
      apiKey: 'test-key',
      fetchImpl: async () => response({ files: [
        { fileName: 'apc260908.zip' },
        { fileName: 'apc260909.zip' },
        { fileName: 'apc260910.zip' },
      ] }),
    });
    const updates = await adapter.discoverUpdates(new Date('2026-09-09T19:00:00.000Z'));
    assert.deepEqual(updates.map((item) => item.fileName), ['apc260909.zip', 'apc260910.zip']);
  });

  it('sends the API key only to the official API endpoint, never to the signed redirect host', async () => {
    const calls = [];
    const adapter = new UsptoOdpBulkXmlAdapter({
      apiKey: 'secret-test-key',
      fetchImpl: async (url, options) => {
        calls.push({ url, headers: options.headers });
        if (url.startsWith('https://api.uspto.gov/')) {
          return response('', { status: 302, headers: { location: 'https://downloads.example.test/signed/file.zip?signature=opaque' } });
        }
        return response('zip-bytes');
      },
    });
    const request = await adapter.openDownload({
      product: 'TRTDXFAP',
      fileName: 'apc260911.zip',
      date: new Date('2026-09-11T00:00:00.000Z'),
      url: adapter.fileUrl('TRTDXFAP', 'apc260911.zip'),
    });
    request.close();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers['x-api-key'], 'secret-test-key');
    assert.equal(calls[1].headers['x-api-key'], undefined);
  });

  it('requires explicit ODP credentials when the production source is ODP', () => {
    assert.throws(() => loadUsptoBulkSourceConfig({ USPTO_BULK_SOURCE: 'odp' }), /USPTO_ODP_API_KEY/);
    assert.deepEqual(loadUsptoBulkSourceConfig({
      USPTO_BULK_SOURCE: 'odp', USPTO_ODP_API_KEY: 'key',
    }), {
      usptoBulkSource: 'odp',
      usptoOdpApiKey: 'key',
      usptoOdpApiBaseUrl: 'https://api.uspto.gov/api/v1/datasets/products',
      usptoOdpAnnualProduct: 'TRTYRAP',
      usptoOdpDailyProduct: 'TRTDXFAP',
    });
  });
});
