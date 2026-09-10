import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../../src/db/migration-runner.js';
import { createPool } from '../../src/db/pool.js';
import { executeUsptoSearchRefresh } from '../../src/ingestion/uspto-search-refresh-service.js';
import { RegistryRefreshRepository } from '../../src/ingestion/registry-refresh-repository.js';
import { SearchFreshnessService } from '../../src/search/search-freshness-service.js';
import { FreshnessGuardedSearchService } from '../../src/search/freshness-guarded-search-service.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    'Real PostgreSQL integration storage is required. Set TEST_DATABASE_URL; '
    + 'the documented compose setup provides it.',
  );
}

let pool;
let refreshRepo;

before(async () => {
  pool = createPool(databaseUrl);
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(pool, path.resolve(currentDirectory, '../../migrations'));
  refreshRepo = new RegistryRefreshRepository(pool);
});

after(async () => {
  if (!pool) return;
  await pool.end();
});

describe('SEARCH-DATA-01 integration test suite', () => {
  it('stale-search test: returns 503 SEARCH_DATA_STALE and does NOT call Elasticsearch when index is stale', async () => {
    await pool.query("DELETE FROM registry_refresh_runs WHERE source_registry = 'USPTO'");
    // Seed an old completed refresh run (60 hours old > 48 hours max age)
    const oldDate = new Date(Date.now() - 60 * 3600 * 1000).toISOString();
    const runResult = await pool.query(`
      INSERT INTO registry_refresh_runs (
        source_registry, status, requested_since_date, data_through_date,
        discovered_file_count, processed_record_count, changed_record_count,
        projected_record_count, projection_backlog_count, started_at, completed_at
      ) VALUES ('USPTO', 'complete', '2026-08-01', '2026-08-01', 1, 10, 10, 10, 0, $1, $1)
      RETURNING id
    `, [oldDate]);
    const seededRunId = runResult.rows[0].id;

    let elasticsearchCalled = false;
    const mockInnerSearchService = {
      async search() {
        elasticsearchCalled = true;
        return { results: [], sourceStatuses: [] };
      },
    };

    const freshnessService = new SearchFreshnessService({
      repository: refreshRepo,
      expectedIntervalHours: 24,
      maxMissedRefreshRuns: 2,
    });

    const guardedSearchService = new FreshnessGuardedSearchService({
      searchService: mockInnerSearchService,
      freshnessService,
    });

    await assert.rejects(
      () => guardedSearchService.search({ mark: 'TEST' }, {}),
      (err) => err.status === 503 && err.code === 'SEARCH_DATA_STALE',
    );

    assert.equal(elasticsearchCalled, false, 'Elasticsearch MUST NOT be called when data is stale');

    // Clean up seeded run
    await pool.query('DELETE FROM registry_refresh_runs WHERE id = $1', [seededRunId]);
  });

  it('outage recovery test: calculates since date from last complete run date minus overlap after a 5-day outage', async () => {
    await pool.query("DELETE FROM registry_refresh_runs WHERE source_registry = 'USPTO'");
    const lastCompleteDate = '2026-08-10';
    const completedAt = new Date().toISOString();
    const runResult = await pool.query(`
      INSERT INTO registry_refresh_runs (
        source_registry, status, requested_since_date, data_through_date,
        discovered_file_count, processed_record_count, changed_record_count,
        projected_record_count, projection_backlog_count, started_at, completed_at
      ) VALUES ('USPTO', 'complete', '2026-08-10', '2026-08-10', 1, 5, 5, 5, 0, $1, $1)
      RETURNING id
    `, [completedAt]);
    const seededRunId = runResult.rows[0].id;

    let discoveredSince = null;
    const mockAdapter = {
      sourceName: 'USPTO',
      async discoverUpdates(since) {
        discoveredSince = since.toISOString().slice(0, 10);
        return [];
      },
    };

    const mockProjector = {
      async project() {},
    };

    const config = {
      usptoIngestionOverlapDays: 3,
      elasticsearchUrl: 'https://localhost:9200',
      elasticsearchIndex: 'trademarks_composite',
    };

    await executeUsptoSearchRefresh({
      pool,
      config,
      adapterOverride: mockAdapter,
      projectorOverride: mockProjector,
    });

    // 2026-08-10 minus 3 days overlap = 2026-08-07
    assert.equal(discoveredSince, '2026-08-07');

    await pool.query('DELETE FROM registry_refresh_runs WHERE id = $1', [seededRunId]);
  });
});
