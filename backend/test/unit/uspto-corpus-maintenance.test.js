import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dropPostgresTrademarkSearchIndexes,
  getUsptoCorpusPrunePreview,
  pruneInactiveUsptoRecords,
} from '../../src/ingestion/uspto-corpus-maintenance.js';

describe('USPTO corpus maintenance', () => {
  it('reports the removable status groups without mutating the database', async () => {
    const calls = [];
    const pool = {
      async query(sql, parameters) {
        calls.push({ sql, parameters });
        if (sql.includes('GROUP BY status')) {
          return { rows: [{ status: 'abandoned', count: '4' }, { status: 'registered', count: '6' }] };
        }
        return { rows: [{ table_size: '379 MB', index_size: '650 MB', total_size: '1029 MB' }] };
      },
    };

    const preview = await getUsptoCorpusPrunePreview({ pool });

    assert.deepEqual(preview, {
      sourceRegistry: 'USPTO',
      removableByStatus: [
        { status: 'abandoned', count: 4 },
        { status: 'registered', count: 6 },
      ],
      relationSize: { tableSize: '379 MB', indexSize: '650 MB', totalSize: '1029 MB' },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].parameters, ['USPTO', ['registered', 'pending']]);
    assert.equal(calls[1].parameters, undefined);
  });

  it('refuses to delete inactive records without an explicit apply flag', async () => {
    let called = false;
    await assert.rejects(
      () => pruneInactiveUsptoRecords({ pool: { async query() { called = true; } } }),
      /apply: true/,
    );
    assert.equal(called, false);
  });

  it('deletes inactive records in bounded batches when explicitly enabled', async () => {
    const calls = [];
    const pool = {
      async query(sql, parameters) {
        calls.push({ sql, parameters });
        return { rowCount: calls.length === 1 ? 2 : 0 };
      },
    };

    const result = await pruneInactiveUsptoRecords({ pool, apply: true, batchSize: 2 });

    assert.equal(result.deleted, 2);
    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /DELETE FROM registry_trademarks/);
    assert.deepEqual(calls[0].parameters, ['USPTO', ['registered', 'pending'], 2]);
  });

  it('drops only the explicitly approved PostgreSQL search indexes', async () => {
    const calls = [];
    const pool = { async query(sql) { calls.push(sql); } };
    const result = await dropPostgresTrademarkSearchIndexes({ pool });

    assert.equal(result.dropped, 5);
    assert.equal(calls.length, 5);
    assert.ok(calls.every((sql) => sql.startsWith('DROP INDEX CONCURRENTLY IF EXISTS public.')));
    assert.equal(calls.some((sql) => sql.includes('registry_trademarks_mark_text_idx')), false);
    assert.equal(calls.some((sql) => sql.includes('registry_trademarks_filter_idx')), false);
  });
});
