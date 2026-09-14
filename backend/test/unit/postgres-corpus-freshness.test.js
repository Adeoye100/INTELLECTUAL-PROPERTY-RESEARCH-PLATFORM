import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SearchFreshnessService } from '../../src/search/search-freshness-service.js';
import { RegistryRefreshRepository } from '../../src/ingestion/registry-refresh-repository.js';

const originalMode = process.env.SEARCH_FRESHNESS_MODE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.SEARCH_FRESHNESS_MODE;
  else process.env.SEARCH_FRESHNESS_MODE = originalMode;
});

describe('persisted PostgreSQL corpus freshness', () => {
  it('treats a non-empty USPTO corpus as searchable only after a completed baseline', async () => {
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    const repository = {
      async latestRun() { return null; },
      async latestCompleteRun(source) {
        assert.equal(source, 'USPTO');
        return {
          id: 'run-latest',
          status: 'complete',
          coverageKind: 'incremental',
          dataThroughDate: '2026-09-13',
          completedAt: '2026-09-14T10:00:00.000Z',
        };
      },
      async latestCompleteBaselineRun(source) {
        assert.equal(source, 'USPTO');
        return {
          id: 'run-baseline',
          status: 'complete',
          coverageKind: 'baseline',
          dataThroughDate: '2026-04-03',
          completedAt: '2026-09-13T10:00:00.000Z',
        };
      },
      async corpusSummary(source) {
        assert.equal(source, 'USPTO');
        return {
          recordCount: 14_000_000,
          dataThroughDate: '2026-09-13',
          indexedAt: '2026-09-14T10:00:00.000Z',
        };
      },
    };
    const service = new SearchFreshnessService({ repository });
    const freshness = await service.assertSearchReady('USPTO');

    assert.equal(freshness.status, 'ready');
    assert.equal(freshness.dataThrough, '2026-09-13');
    assert.equal(freshness.indexedAt, '2026-09-14T10:00:00.000Z');
    assert.equal(freshness.sourceMode, 'persisted-bulk-corpus');
    assert.equal(freshness.refreshRunId, 'run-latest');
    assert.equal(freshness.baselineRunId, 'run-baseline');
    assert.equal(freshness.corpusComplete, true);
  });

  it('fails closed when the configured persisted USPTO corpus is empty', async () => {
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    const repository = {
      async latestRun() { return null; },
      async latestCompleteRun() { return null; },
      async latestCompleteBaselineRun() { return null; },
      async corpusSummary() {
        return { recordCount: 0, dataThroughDate: null, indexedAt: null };
      },
    };
    const service = new SearchFreshnessService({ repository });
    await assert.rejects(
      () => service.assertSearchReady('USPTO'),
      (error) => error?.status === 503 && error?.code === 'SEARCH_CORPUS_UNAVAILABLE',
    );
  });

  it('fails closed when rows and incremental imports exist but no completed baseline proves corpus integrity', async () => {
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    const repository = {
      async latestRun() { return { id: 'run-partial', status: 'complete' }; },
      async latestCompleteRun() {
        return {
          id: 'run-daily-only',
          status: 'complete',
          coverageKind: 'incremental',
          dataThroughDate: '2026-09-14',
          completedAt: '2026-09-14T10:00:00.000Z',
        };
      },
      async latestCompleteBaselineRun() { return null; },
      async corpusSummary() {
        return { recordCount: 500, dataThroughDate: '2026-09-14', indexedAt: '2026-09-14T10:00:00.000Z' };
      },
    };
    const service = new SearchFreshnessService({ repository });
    const freshness = await service.getSearchFreshness('USPTO');
    assert.equal(freshness.status, 'stale');
    assert.equal(freshness.recordCount, 500);
    assert.equal(freshness.corpusComplete, false);
    assert.equal(freshness.refreshRunId, 'run-daily-only');
    assert.equal(freshness.baselineRunId, null);
    await assert.rejects(
      () => service.assertSearchReady('USPTO'),
      (error) => error?.status === 503 && error?.code === 'SEARCH_CORPUS_UNAVAILABLE',
    );
  });

  it('RegistryRefreshRepository corpusSummary uses a parameterized source filter', async () => {
    const calls = [];
    const repository = new RegistryRefreshRepository({
      async query(sql, parameters) {
        calls.push({ sql, parameters });
        return {
          rows: [{
            record_count: '12',
            data_through_date: new Date('2026-09-10T00:00:00.000Z'),
            indexed_at: new Date('2026-09-14T09:00:00.000Z'),
          }],
        };
      },
    });
    const summary = await repository.corpusSummary('USPTO');

    assert.deepEqual(calls[0].parameters, ['USPTO']);
    assert.match(calls[0].sql, /WHERE source_registry = \$1/);
    assert.equal(summary.recordCount, 12);
    assert.equal(summary.dataThroughDate, '2026-09-10');
    assert.equal(summary.indexedAt, '2026-09-14T09:00:00.000Z');
  });

  it('queries completed baseline evidence with a parameterized source filter', async () => {
    const calls = [];
    const repository = new RegistryRefreshRepository({
      async query(sql, parameters) {
        calls.push({ sql, parameters });
        return { rowCount: 0, rows: [] };
      },
    });
    const result = await repository.latestCompleteBaselineRun('USPTO');

    assert.equal(result, null);
    assert.deepEqual(calls[0].parameters, ['USPTO']);
    assert.match(calls[0].sql, /coverage_kind = 'baseline'/);
  });
});
