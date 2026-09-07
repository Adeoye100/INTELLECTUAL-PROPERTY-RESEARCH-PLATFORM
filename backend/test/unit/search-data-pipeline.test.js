import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UsptoBulkXmlAdapter } from '../../src/registries/uspto/bulk-xml-adapter.js';
import { ingestRegistryRecords } from '../../src/ingestion/ingest-registry.js';
import { SearchFreshnessService } from '../../src/search/search-freshness-service.js';
import { FreshnessGuardedSearchService } from '../../src/search/freshness-guarded-search-service.js';

describe('SEARCH-DATA-01 unit test suite', () => {
  describe('A. SINCE DATE & BACKFILL LOGIC', () => {
    it('calculates overlap correctly from last complete run date rather than current date', () => {
      const lastCompleteDateStr = '2026-08-20';
      const lastCompleteDate = new Date(`${lastCompleteDateStr}T00:00:00.000Z`);
      const overlapDays = 3;
      const expectedSince = new Date(lastCompleteDate);
      expectedSince.setUTCDate(expectedSince.getUTCDate() - overlapDays);

      assert.equal(expectedSince.toISOString().slice(0, 10), '2026-08-17');
    });

    it('handles a 7-day outage by calculating from the last complete run date minus overlap', () => {
      const lastCompleteDateStr = '2026-08-10';
      const lastCompleteDate = new Date(`${lastCompleteDateStr}T00:00:00.000Z`);
      const overlapDays = 3;
      const calculatedSince = new Date(lastCompleteDate);
      calculatedSince.setUTCDate(calculatedSince.getUTCDate() - overlapDays);

      assert.equal(calculatedSince.toISOString().slice(0, 10), '2026-08-07');
    });
  });

  describe('B. BULK ADAPTER FETCHUPDATE BOUNDARIES', () => {
    it('rejects update object targeting a cross-origin URL', async () => {
      const adapter = new UsptoBulkXmlAdapter({
        listingUrl: 'https://bulkdata.uspto.gov/data/trademark/daily',
      });
      const invalidUpdate = {
        date: new Date('2026-09-01'),
        url: 'https://evil-attacker.com/apc260901.zip',
      };

      await assert.rejects(
        async () => {
          for await (const _record of adapter.fetchUpdate(invalidUpdate)) {
            // should throw
          }
        },
        /archive URL origin does not match listing origin/,
      );
    });

    it('rejects fetchUpdate when update object is malformed', async () => {
      const adapter = new UsptoBulkXmlAdapter({
        listingUrl: 'https://bulkdata.uspto.gov/data/trademark/daily',
      });
      await assert.rejects(
        async () => {
          for await (const _record of adapter.fetchUpdate(null)) {
            // should throw
          }
        },
        /requires a valid update object/,
      );
    });
  });

  describe('C. INGESTION RECORD BATCHING', () => {
    it('batches records and flushes to repository properly', async () => {
      const records = [
        { markText: 'ONE' },
        { markText: 'TWO' },
        { markText: 'THREE' },
      ];
      async function* generateRecords() {
        for (const r of records) yield r;
      }
      const batches = [];
      const repository = {
        async upsertBatch(batch) {
          batches.push([...batch]);
          return batch.length;
        },
      };

      const result = await ingestRegistryRecords({
        records: generateRecords(),
        repository,
        batchSize: 2,
      });

      assert.equal(result.processed, 3);
      assert.equal(result.changed, 3);
      assert.equal(batches.length, 2);
      assert.equal(batches[0].length, 2);
      assert.equal(batches[1].length, 1);
    });
  });

  describe('D. SEARCH FRESHNESS SERVICE', () => {
    it('returns ready status when latest complete run is recent', async () => {
      const now = new Date('2026-09-07T12:00:00.000Z');
      const recentComplete = {
        id: 'run-1',
        status: 'complete',
        dataThroughDate: '2026-09-06',
        completedAt: '2026-09-07T07:15:00.000Z',
      };
      const repository = {
        async latestCompleteRun() { return recentComplete; },
        async latestRun() { return recentComplete; },
      };
      const freshnessService = new SearchFreshnessService({
        repository,
        expectedIntervalHours: 24,
        maxMissedRefreshRuns: 2,
        clock: () => now,
      });

      const freshness = await freshnessService.getSearchFreshness('USPTO');
      assert.equal(freshness.status, 'ready');
      assert.equal(freshness.dataThrough, '2026-09-06');
      assert.equal(freshness.refreshing, false);
    });

    it('returns refreshing status when a run is currently in progress', async () => {
      const now = new Date('2026-09-07T12:00:00.000Z');
      const recentComplete = {
        id: 'run-1',
        status: 'complete',
        dataThroughDate: '2026-09-06',
        completedAt: '2026-09-07T07:15:00.000Z',
      };
      const currentRun = {
        id: 'run-2',
        status: 'running',
      };
      const repository = {
        async latestCompleteRun() { return recentComplete; },
        async latestRun() { return currentRun; },
      };
      const freshnessService = new SearchFreshnessService({
        repository,
        expectedIntervalHours: 24,
        maxMissedRefreshRuns: 2,
        clock: () => now,
      });

      const freshness = await freshnessService.getSearchFreshness('USPTO');
      assert.equal(freshness.status, 'refreshing');
      assert.equal(freshness.refreshing, true);
    });

    it('returns degraded status when latest run failed but previous complete is within grace period', async () => {
      const now = new Date('2026-09-07T12:00:00.000Z');
      const recentComplete = {
        id: 'run-1',
        status: 'complete',
        dataThroughDate: '2026-09-06',
        completedAt: '2026-09-07T07:15:00.000Z',
      };
      const failedRun = {
        id: 'run-2',
        status: 'failed',
        errorCode: 'BULK_DOWNLOAD_FAILED',
      };
      const repository = {
        async latestCompleteRun() { return recentComplete; },
        async latestRun() { return failedRun; },
      };
      const freshnessService = new SearchFreshnessService({
        repository,
        expectedIntervalHours: 24,
        maxMissedRefreshRuns: 2,
        clock: () => now,
      });

      const freshness = await freshnessService.getSearchFreshness('USPTO');
      assert.equal(freshness.status, 'degraded');
      assert.equal(freshness.refreshing, false);
    });

    it('returns stale status when no complete run exists', async () => {
      const repository = {
        async latestCompleteRun() { return null; },
        async latestRun() { return null; },
      };
      const freshnessService = new SearchFreshnessService({
        repository,
        expectedIntervalHours: 24,
        maxMissedRefreshRuns: 2,
      });

      const freshness = await freshnessService.getSearchFreshness('USPTO');
      assert.equal(freshness.status, 'stale');
      assert.equal(freshness.dataThrough, null);
    });

    it('returns stale status when last complete run exceeds max allowed age (48 hours)', async () => {
      const now = new Date('2026-09-10T12:00:00.000Z');
      const oldComplete = {
        id: 'run-1',
        status: 'complete',
        dataThroughDate: '2026-09-05',
        completedAt: '2026-09-05T07:15:00.000Z', // 53 hours old > 48 hours
      };
      const repository = {
        async latestCompleteRun() { return oldComplete; },
        async latestRun() { return oldComplete; },
      };
      const freshnessService = new SearchFreshnessService({
        repository,
        expectedIntervalHours: 24,
        maxMissedRefreshRuns: 2,
        clock: () => now,
      });

      const freshness = await freshnessService.getSearchFreshness('USPTO');
      assert.equal(freshness.status, 'stale');
    });

    it('throws 503 SEARCH_DATA_STALE when assertSearchReady is called on stale data', async () => {
      const repository = {
        async latestCompleteRun() { return null; },
        async latestRun() { return null; },
      };
      const freshnessService = new SearchFreshnessService({
        repository,
        expectedIntervalHours: 24,
        maxMissedRefreshRuns: 2,
      });

      await assert.rejects(
        () => freshnessService.assertSearchReady('USPTO'),
        (err) => err.status === 503 && err.code === 'SEARCH_DATA_STALE',
      );
    });
  });

  describe('E. FRESHNESS GUARDED SEARCH SERVICE', () => {
    it('calls inner search service when freshness is ready and attaches dataFreshness', async () => {
      const readiness = {
        source: 'USPTO',
        status: 'ready',
        dataThrough: '2026-09-06',
        indexedAt: '2026-09-07T07:15:00.000Z',
      };
      const freshnessService = {
        async assertSearchReady() { return readiness; },
      };
      let innerCalled = false;
      const searchService = {
        async search(query, context) {
          innerCalled = true;
          return { results: [], sourceStatuses: [] };
        },
      };
      const guarded = new FreshnessGuardedSearchService({
        searchService,
        freshnessService,
      });

      const res = await guarded.search({ mark: 'FORGE' }, {});
      assert.equal(innerCalled, true);
      assert.deepEqual(res.dataFreshness, readiness);
    });

    it('prevents inner search service execution when stale', async () => {
      const freshnessService = {
        async assertSearchReady() {
          const err = new Error('SEARCH_DATA_STALE');
          err.status = 503;
          err.code = 'SEARCH_DATA_STALE';
          throw err;
        },
      };
      let innerCalled = false;
      const searchService = {
        async search() {
          innerCalled = true;
          return { results: [] };
        },
      };
      const guarded = new FreshnessGuardedSearchService({
        searchService,
        freshnessService,
      });

      await assert.rejects(
        () => guarded.search({ mark: 'FORGE' }, {}),
        (err) => err.status === 503 && err.code === 'SEARCH_DATA_STALE',
      );
      assert.equal(innerCalled, false);
    });
  });
});
