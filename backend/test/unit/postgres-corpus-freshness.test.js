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
  it('treats a non-empty USPTO corpus as searchable and exposes its source date', async () => {
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    let ledgerCalls = 0;
    const repository = {
      async latestRun() { ledgerCalls += 1; return null; },
      async latestCompleteRun() { ledgerCalls += 1; return null; },
      async corpusSummary(source) {
        assert.equal(source, 'USPTO');
        return {
          recordCount: 3733,
          dataThroughDate: '2026-01-05',
          indexedAt: '2026-09-14T10:00:00.000Z',
        };
      },
    };
    const service = new SearchFreshnessService({ repository });
    const freshness = await service.assertSearchReady('USPTO');

    assert.equal(freshness.status, 'ready');
    assert.equal(freshness.dataThrough, '2026-01-05');
    assert.equal(freshness.indexedAt, '2026-09-14T10:00:00.000Z');
    assert.equal(freshness.sourceMode, 'persisted-bulk-corpus');
    assert.equal(ledgerCalls, 0);
  });

  it('fails closed when the configured persisted USPTO corpus is empty', async () => {
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    const repository = {
      async latestRun() { return null; },
      async latestCompleteRun() { return null; },
      async corpusSummary() {
        return { recordCount: 0, dataThroughDate: null, indexedAt: null };
      },
    };
    const service = new SearchFreshnessService({ repository });
    await assert.rejects(
      () => service.assertSearchReady('USPTO'),
      (error) => error?.status === 503 && error?.code === 'SEARCH_CORPUS_EMPTY',
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
});
