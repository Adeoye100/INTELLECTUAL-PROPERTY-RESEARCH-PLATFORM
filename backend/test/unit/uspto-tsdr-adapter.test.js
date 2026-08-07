import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  NotSupportedError,
  RegistryConfigurationError,
} from '../../src/registries/registry-adapter.js';
import { UsptoTsdrAdapter } from '../../src/registries/uspto/tsdr-adapter.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  directory,
  '../fixtures/tsdr/status-response.pending-live-verification.json',
);

describe('USPTO TSDR adapter (response projection pending live key verification)', () => {
  it('rejects fetchUpdates because TSDR is not a bulk source', async () => {
    const adapter = new UsptoTsdrAdapter({ apiKey: 'fixture-key' });
    await assert.rejects(
      async () => {
        for await (const _record of adapter.fetchUpdates(new Date())) {
          assert.fail('TSDR must not yield bulk records.');
        }
      },
      (error) => error instanceof NotSupportedError && /not a bulk/.test(error.message),
    );
  });

  it('fails clearly at call time when USPTO_TSDR_API_KEY is absent', async () => {
    const adapter = new UsptoTsdrAdapter({ apiKey: '' });
    await assert.rejects(
      adapter.getStatus('78787878'),
      (error) => error instanceof RegistryConfigurationError
        && error.code === 'REGISTRY_CONFIGURATION_ERROR'
        && error.message.includes('USPTO_TSDR_API_KEY'),
    );
  });

  it('uses the documented endpoint and USPTO-API-KEY header', async () => {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    let request;
    const adapter = new UsptoTsdrAdapter({
      apiKey: 'test-only-key',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => fixture };
      },
    });

    const result = await adapter.getStatus('7878-7878');
    assert.equal(
      request.url,
      'https://tsdrapi.uspto.gov/ts/cd/casestatus/sn78787878/info.json',
    );
    assert.equal(request.options.headers['USPTO-API-KEY'], 'test-only-key');
    assert.equal(result.referenceId, '78787878');
    assert.equal(result.sourceRegistry, 'USPTO');
    assert.equal(result.status, 'REGISTERED');
    assert.equal(result.statusCode, '700');
    assert.deepEqual(result.raw, fixture);
  });
});
