import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../../src/db/migration-runner.js';
import { createPool } from '../../src/db/pool.js';
import { ingestOfficeActionRecords } from '../../src/office-actions/office-action-ingestion.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    'Real PostgreSQL integration storage is required. Set TEST_DATABASE_URL; '
    + 'the documented compose setup provides it.',
  );
}

let pool;

before(async () => {
  pool = createPool(databaseUrl);
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(pool, path.resolve(currentDirectory, '../../migrations'));
});

after(async () => {
  if (!pool) return;
  await pool.end();
});

describe('Office Action Ingestion Atomic Transaction Integration', () => {
  it('Section 17: Ingests valid records atomically and records complete ledger', async () => {
    const ref1 = `ref-succ-${randomUUID()}`;
    const ref2 = `ref-succ-${randomUUID()}`;
    const records = [
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref1,
        applicationNumber: '88900001',
        markText: 'ATOMIC ONE',
        documentType: 'non_final_office_action',
        examinerReasoningText: 'Section 2(d) refusal.',
        sourcePublishedAt: '2026-06-01T10:00:00Z',
      },
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref2,
        applicationNumber: '88900002',
        markText: 'ATOMIC TWO',
        documentType: 'final_office_action',
        examinerReasoningText: 'Section 2(e)(1) refusal.',
        sourcePublishedAt: '2026-06-02T10:00:00Z',
      },
    ];

    const stats = await ingestOfficeActionRecords(pool, records);
    assert.equal(stats.processed, 2);
    assert.equal(stats.inserted, 2);
    assert.equal(stats.updated, 0);
    assert.equal(stats.unchanged, 0);
    assert.equal(stats.rejected, 0);
    assert.equal(stats.processed, stats.inserted + stats.updated + stats.unchanged + stats.rejected);
    assert.equal(stats.dataThrough, '2026-06-02');
    assert.ok(stats.runId);

    const runRow = await pool.query(
      'SELECT status, processed_count, inserted_count, updated_count, unchanged_count, rejected_count, data_through FROM office_action_corpus_runs WHERE id = $1',
      [stats.runId],
    );
    assert.equal(runRow.rows.length, 1);
    assert.equal(runRow.rows[0].status, 'complete');
    assert.equal(runRow.rows[0].processed_count, 2);
    const rawDate = runRow.rows[0].data_through;
    const dataThroughStr = rawDate
      ? (rawDate instanceof Date
        ? `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`
        : String(rawDate).slice(0, 10))
      : null;
    assert.equal(dataThroughStr, '2026-06-02');

    const docs = await pool.query(
      'SELECT source_reference_id FROM office_action_documents WHERE source_reference_id IN ($1, $2)',
      [ref1, ref2],
    );
    assert.equal(docs.rows.length, 2);
  });

  it('Section 18: Mandatory Rollback Test — Controlled DB failure after 1st document mutation rolls back all documents and marks run failed', async () => {
    const ref1 = `ref-roll-${randomUUID()}`;
    const ref2 = `ref-roll-${randomUUID()}`;
    const records = [
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref1,
        applicationNumber: '88900010',
        markText: 'ROLLBACK ONE',
        documentType: 'non_final_office_action',
      },
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref2,
        applicationNumber: '88900011',
        markText: 'ROLLBACK TWO',
        documentType: 'final_office_action',
      },
    ];

    let insertCount = 0;
    const failingDb = {
      query: (sql, params) => pool.query(sql, params),
      connect: async () => {
        const realClient = await pool.connect();
        return {
          query: async (sql, params) => {
            if (typeof sql === 'string' && sql.includes('INSERT INTO office_action_documents')) {
              insertCount++;
              if (insertCount === 2) {
                throw new Error('Simulated document database failure on 2nd record');
              }
            }
            return realClient.query(sql, params);
          },
          release: (destroy) => realClient.release(destroy),
        };
      },
    };

    await assert.rejects(
      async () => ingestOfficeActionRecords(failingDb, records),
      (err) => err.code === 'OFFICE_ACTION_CORPUS_INGESTION_FAILED',
    );

    const doc1 = await pool.query(
      'SELECT id FROM office_action_documents WHERE source_reference_id = $1',
      [ref1],
    );
    assert.equal(doc1.rows.length, 0, 'First document MUST NOT remain committed after transaction rollback');

    const doc2 = await pool.query(
      'SELECT id FROM office_action_documents WHERE source_reference_id = $1',
      [ref2],
    );
    assert.equal(doc2.rows.length, 0, 'Second document MUST NOT be committed');

    const failedRuns = await pool.query(
      "SELECT status, error_code FROM office_action_corpus_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 1",
    );
    assert.equal(failedRuns.rows.length, 1);
    assert.equal(failedRuns.rows[0].status, 'failed');
    assert.equal(failedRuns.rows[0].error_code, 'OFFICE_ACTION_CORPUS_INGESTION_FAILED');
  });

  it('Section 19: Complete-ledger failure rolls back documents and marks run failed', async () => {
    const ref1 = `ref-ledgfail-${randomUUID()}`;
    const records = [
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref1,
        applicationNumber: '88900020',
        markText: 'LEDGER FAIL ONE',
        documentType: 'suspension',
      },
    ];

    const ledgerFailingDb = {
      query: (sql, params) => pool.query(sql, params),
      connect: async () => {
        const realClient = await pool.connect();
        return {
          query: async (sql, params) => {
            if (typeof sql === 'string' && sql.includes("SET status = 'complete'")) {
              throw new Error('Simulated complete ledger update failure');
            }
            return realClient.query(sql, params);
          },
          release: (destroy) => realClient.release(destroy),
        };
      },
    };

    await assert.rejects(
      async () => ingestOfficeActionRecords(ledgerFailingDb, records),
      (err) => err.code === 'OFFICE_ACTION_CORPUS_RUN_UPDATE_FAILED',
    );

    const doc = await pool.query(
      'SELECT id FROM office_action_documents WHERE source_reference_id = $1',
      [ref1],
    );
    assert.equal(doc.rows.length, 0, 'Document MUST NOT remain committed when ledger completion update fails');

    const failedRun = await pool.query(
      "SELECT status, error_code FROM office_action_corpus_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 1",
    );
    assert.equal(failedRun.rows.length, 1);
    assert.equal(failedRun.rows[0].status, 'failed');
    assert.equal(failedRun.rows[0].error_code, 'OFFICE_ACTION_CORPUS_RUN_UPDATE_FAILED');
  });

  it('Section 20: Replay integration test — 1st run inserts, 2nd run unchanged, independent ledgers', async () => {
    const ref1 = `ref-replay-${randomUUID()}`;
    const ref2 = `ref-replay-${randomUUID()}`;
    const records = [
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref1,
        applicationNumber: '88900030',
        markText: 'REPLAY ONE',
        documentType: 'non_final_office_action',
        sourcePublishedAt: '2026-06-01T10:00:00Z',
      },
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref2,
        applicationNumber: '88900031',
        markText: 'REPLAY TWO',
        documentType: 'final_office_action',
        sourcePublishedAt: '2026-06-01T10:00:00Z',
      },
    ];

    const run1 = await ingestOfficeActionRecords(pool, records);
    assert.equal(run1.inserted, 2);
    assert.equal(run1.unchanged, 0);

    const run2 = await ingestOfficeActionRecords(pool, records);
    assert.equal(run2.inserted, 0);
    assert.equal(run2.updated, 0);
    assert.equal(run2.unchanged, 2);
    assert.notEqual(run1.runId, run2.runId);

    const run1Db = await pool.query('SELECT status, inserted_count, unchanged_count FROM office_action_corpus_runs WHERE id = $1', [run1.runId]);
    const run2Db = await pool.query('SELECT status, inserted_count, unchanged_count FROM office_action_corpus_runs WHERE id = $1', [run2.runId]);
    assert.equal(run1Db.rows[0].inserted_count, 2);
    assert.equal(run1Db.rows[0].unchanged_count, 0);
    assert.equal(run2Db.rows[0].inserted_count, 0);
    assert.equal(run2Db.rows[0].unchanged_count, 2);

    const docsCount = await pool.query(
      'SELECT COUNT(*)::int as cnt FROM office_action_documents WHERE source_reference_id IN ($1, $2)',
      [ref1, ref2],
    );
    assert.equal(docsCount.rows[0].cnt, 2, 'No duplicate documents created');
  });

  it('Section 21: Partial validation test — 2 valid + 1 invalid commits valid records and marks complete', async () => {
    const ref1 = `ref-part-${randomUUID()}`;
    const ref2 = `ref-part-${randomUUID()}`;
    const records = [
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref1,
        applicationNumber: '88900040',
        markText: 'PARTIAL VALID ONE',
        documentType: 'non_final_office_action',
      },
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: `ref-invalid-${randomUUID()}`,
        documentType: 'non_final_office_action',
        examinerReasoningText: '<script>alert("HTML forbidden")</script>',
      },
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: ref2,
        applicationNumber: '88900042',
        markText: 'PARTIAL VALID TWO',
        documentType: 'final_office_action',
      },
    ];

    const stats = await ingestOfficeActionRecords(pool, records);
    assert.equal(stats.processed, 3);
    assert.equal(stats.inserted, 2);
    assert.equal(stats.updated, 0);
    assert.equal(stats.unchanged, 0);
    assert.equal(stats.rejected, 1);
    assert.equal(stats.processed, stats.inserted + stats.updated + stats.unchanged + stats.rejected);

    const runRow = await pool.query('SELECT status FROM office_action_corpus_runs WHERE id = $1', [stats.runId]);
    assert.equal(runRow.rows[0].status, 'complete');

    const docs = await pool.query(
      'SELECT source_reference_id FROM office_action_documents WHERE source_reference_id IN ($1, $2)',
      [ref1, ref2],
    );
    assert.equal(docs.rows.length, 2);
  });

  it('Section 22: All-rejected test — all invalid records roll back and mark run failed with ALL_RECORDS_REJECTED', async () => {
    const records = [
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: `ref-bad1-${randomUUID()}`,
        documentType: 'non_final_office_action',
        examinerReasoningText: '<b>HTML 1</b>',
      },
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: `ref-bad2-${randomUUID()}`,
        documentType: 'final_office_action',
        examinerReasoningText: '<i>HTML 2</i>',
      },
    ];

    await assert.rejects(
      async () => ingestOfficeActionRecords(pool, records),
      (err) => err.code === 'ALL_RECORDS_REJECTED',
    );

    const failedRun = await pool.query(
      "SELECT status, error_code, processed_count, rejected_count FROM office_action_corpus_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 1",
    );
    assert.equal(failedRun.rows.length, 1);
    assert.equal(failedRun.rows[0].status, 'failed');
    assert.equal(failedRun.rows[0].error_code, 'ALL_RECORDS_REJECTED');
    assert.equal(failedRun.rows[0].processed_count, 2);
    assert.equal(failedRun.rows[0].rejected_count, 2);
  });
});
