import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FederatedSearchService } from '../../src/search/federated-search-service.js';

function createService(sources, overrides = {}) {
  return new FederatedSearchService({
    sources,
    requestIdFactory: () => 'request-test-id',
    ...overrides,
  });
}

describe('FederatedSearchService', () => {
  it('returns combined results and complete statuses when all sources succeed', async () => {
    const result = await createService([
      { sourceName: 'USPTO', search: async () => [{ id: 'us-1', sourceRegistry: 'USPTO' }] },
      { sourceName: 'EUIPO', search: async () => [{ id: 'eu-1', sourceRegistry: 'EUIPO' }] },
    ]).search({ mark: 'NIMBL' });

    assert.deepEqual(result, {
      results: [{ id: 'us-1', sourceRegistry: 'USPTO' }, { id: 'eu-1', sourceRegistry: 'EUIPO' }],
      sourceStatuses: [
        { source: 'USPTO', status: 'complete', resultCount: 1 },
        { source: 'EUIPO', status: 'complete', resultCount: 1 },
      ],
      partial: false,
      requestId: 'request-test-id',
    });
  });

  it('starts every source before waiting for any source to finish', async () => {
    const started = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const service = createService(['USPTO', 'EUIPO'].map((sourceName) => ({
      sourceName,
      search: async () => {
        started.push(sourceName);
        await gate;
        return [];
      },
    })));

    const search = service.search({ mark: 'NIMBL' });
    await Promise.resolve();
    assert.deepEqual(started, ['USPTO', 'EUIPO']);
    release();
    await search;
  });

  it('keeps healthy results when one source fails and logs only safe failure fields', async () => {
    const logs = [];
    const providerError = new Error('query NIMBL and token must not be logged');
    providerError.name = 'RegistryTimeoutError';
    providerError.code = 'REGISTRY_TIMEOUT';
    const result = await createService([
      { sourceName: 'USPTO', search: async () => [{ id: 'us-1', sourceRegistry: 'USPTO' }] },
      { sourceName: 'EUIPO', search: async () => { throw providerError; } },
    ], { logger: { warn: (message, details) => logs.push({ message, details }) } }).search({ mark: 'NIMBL' });

    assert.deepEqual(result.results, [{ id: 'us-1', sourceRegistry: 'USPTO' }]);
    assert.deepEqual(result.sourceStatuses, [
      { source: 'USPTO', status: 'complete', resultCount: 1 },
      { source: 'EUIPO', status: 'unavailable', resultCount: 0 },
    ]);
    assert.equal(result.partial, true);
    assert.deepEqual(logs, [{
      message: 'Federated search source unavailable',
      details: { source: 'EUIPO', name: 'RegistryTimeoutError', code: 'REGISTRY_TIMEOUT' },
    }]);
    assert.equal(JSON.stringify(logs).includes('NIMBL'), false);
  });

  it('resolves a partial response when every source fails', async () => {
    const result = await createService([
      { sourceName: 'USPTO', search: async () => { throw new Error('unavailable'); } },
      { sourceName: 'EUIPO', search: async () => { throw new Error('unavailable'); } },
    ]).search({ mark: 'NIMBL' });

    assert.deepEqual(result.results, []);
    assert.deepEqual(result.sourceStatuses, [
      { source: 'USPTO', status: 'unavailable', resultCount: 0 },
      { source: 'EUIPO', status: 'unavailable', resultCount: 0 },
    ]);
    assert.equal(result.partial, true);
  });

  it('treats non-array provider output as unavailable', async () => {
    const result = await createService([
      { sourceName: 'USPTO', search: async () => ({ records: [] }) },
    ]).search({ mark: 'NIMBL' });

    assert.deepEqual(result.results, []);
    assert.deepEqual(result.sourceStatuses, [
      { source: 'USPTO', status: 'unavailable', resultCount: 0 },
    ]);
    assert.equal(result.partial, true);
  });

  it('keeps source statuses in configured order despite completion order', async () => {
    const result = await createService([
      { sourceName: 'first', search: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return []; } },
      { sourceName: 'second', search: async () => [] },
    ]).search({ mark: 'NIMBL' });

    assert.deepEqual(result.sourceStatuses.map(({ source }) => source), ['first', 'second']);
  });

  it('keeps source and provider result ordering deterministic', async () => {
    const result = await createService([
      { sourceName: 'first', search: async () => [{ id: 'first-1' }, { id: 'first-2' }] },
      { sourceName: 'second', search: async () => [{ id: 'second-1' }, { id: 'second-2' }] },
    ]).search({ mark: 'NIMBL' });

    assert.deepEqual(result.results.map(({ id }) => id), ['first-1', 'first-2', 'second-1', 'second-2']);
  });

  it('rejects duplicate source names', () => {
    assert.throws(() => createService([
      { sourceName: 'USPTO', search: async () => [] },
      { sourceName: 'USPTO', search: async () => [] },
    ]), /Duplicate federated search source/);
  });

  it('rejects invalid source configuration', () => {
    assert.throws(() => new FederatedSearchService(), /at least one source/);
    assert.throws(() => createService([{ search: async () => [] }]), /requires a sourceName/);
    assert.throws(() => createService([{ sourceName: 'USPTO' }]), /requires a search function/);
  });

  it('does not mutate the submitted query object', async () => {
    const query = { mark: 'NIMBL', filters: { jurisdictions: ['US'] } };
    const original = structuredClone(query);
    await createService([{ sourceName: 'USPTO', search: async () => [] }]).search(query);

    assert.deepEqual(query, original);
  });

  it('does not fabricate risk scores', async () => {
    const result = await createService([
      { sourceName: 'USPTO', search: async () => [{ id: 'us-1', sourceRegistry: 'USPTO' }] },
    ]).search({ mark: 'NIMBL' });

    assert.equal(Object.hasOwn(result.results[0], 'riskScore'), false);
  });

  it('uses the injected request ID factory', async () => {
    let calls = 0;
    const service = createService(
      [{ sourceName: 'USPTO', search: async () => [] }],
      { requestIdFactory: () => `request-${++calls}` },
    );

    assert.equal((await service.search({ mark: 'NIMBL' })).requestId, 'request-1');
    assert.equal((await service.search({ mark: 'NIMBL' })).requestId, 'request-2');
  });

  it('preserves a valid trusted request ID for retry-safe execution snapshots', async () => {
    const service = createService([{ sourceName: 'USPTO', search: async () => [] }]);
    const result = await service.search({ mark: 'NIMBL' }, { requestId: 'request-context-123' });
    assert.equal(result.requestId, 'request-context-123');
  });
});
