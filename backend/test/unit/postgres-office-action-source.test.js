import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostgresOfficeActionSource } from '../../src/office-actions/postgres-office-action-source.js';
import { createOfficeActionSearchRuntime } from '../../src/office-actions/office-action-search-runtime.js';
import { ingestOfficeActionRecords, validateIngestionRecord } from '../../src/office-actions/office-action-ingestion.js';

class MockDatabase {
  constructor(rows = []) {
    this.rows = rows;
    this.queries = [];
  }

  async query(sql, parameters = []) {
    this.queries.push({ sql, parameters });
    if (sql.includes('INSERT INTO office_action_corpus_runs')) {
      return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }] };
    }
    if (sql.includes('UPDATE office_action_corpus_runs')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT') && sql.includes('office_action_documents')) {
      return { rows: this.rows };
    }
    if (sql.includes('INSERT INTO office_action_documents')) {
      return { rows: [] };
    }
    if (sql.includes('UPDATE office_action_documents')) {
      return { rows: [] };
    }
    return { rows: this.rows };
  }
}

describe('PostgresOfficeActionSource', () => {
  it('constructs parameterized SQL queries safely and maps returned rows', async () => {
    const db = new MockDatabase([
      {
        source_registry: 'USPTO',
        source_reference_id: 'US-88123456',
        application_number: '88123456',
        mark_text: 'FORGE',
        owner: 'Forge Global',
        jurisdiction: 'US',
        document_type: 'non_final_office_action',
        office_action_date: new Date('2026-05-15'),
        examiner_name: 'Jane Doe',
        examiner_reasoning_text: 'Section 2(d) refusal.',
        summary_method: 'registry',
        source_document_url: 'https://tsdr.uspto.gov/doc.pdf',
        source_metadata: { documentTitle: 'Non-Final' },
      },
    ]);

    const source = new PostgresOfficeActionSource({ database: db, sourceName: 'USPTO', maximumResults: 25 });
    const results = await source.searchOfficeActions({
      markText: "FORGE'; DROP TABLE office_action_documents;--",
      applicationNumber: '88123456',
      owner: 'Forge',
      documentTypes: ['non_final_office_action'],
      filedFrom: '2026-01-01',
      filedTo: '2026-12-31',
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].markText, 'FORGE');
    assert.equal(results[0].examinerReasoningSummary, 'Section 2(d) refusal.');

    const executed = db.queries[0];
    assert.ok(executed.sql.includes('mark_text ILIKE $3'));
    assert.ok(executed.sql.includes('application_number ILIKE $2'));
    assert.equal(executed.parameters[0], 'USPTO');
    assert.equal(executed.parameters[2], "%FORGE'; DROP TABLE office_action_documents;--%");
  });

  it('rejects invalid construction arguments', () => {
    assert.throws(() => new PostgresOfficeActionSource({ database: null }), { name: 'TypeError' });
    assert.throws(() => new PostgresOfficeActionSource({ database: new MockDatabase(), sourceName: '' }), { name: 'TypeError' });
  });

  it('is selected by createOfficeActionSearchRuntime when OFFICE_ACTION_SOURCE_REGISTRIES includes USPTO', () => {
    const postgresSource = new PostgresOfficeActionSource({ database: new MockDatabase(), sourceName: 'USPTO' });
    const runtime = createOfficeActionSearchRuntime({
      officeActionSearchEnabled: true,
      officeActionSourceRegistries: ['USPTO'],
      officeActionSourceTimeoutMs: 3000,
      officeActionSearchMaxResults: 50,
    }, { sources: [postgresSource] });

    assert.equal(runtime.officeActionSources.length, 1);
    assert.equal(runtime.officeActionSources[0], postgresSource);
  });
});

describe('Office Action Ingestion Validator & Process', () => {
  it('validates correct ingestion records and rejects HTML reasoning / credential URLs / invalid timestamps', () => {
    const valid = validateIngestionRecord({
      sourceRegistry: 'USPTO',
      sourceReferenceId: 'ref-1',
      documentType: 'final_office_action',
      examinerReasoningText: 'Plain text examiner reasoning without HTML.',
      sourceDocumentUrl: 'https://tsdr.uspto.gov/doc.pdf',
      sourcePublishedAt: '2026-05-15T10:00:00Z',
      sourceUpdatedAt: '2026-05-15T12:00:00Z',
    });
    assert.equal(valid.sourceRegistry, 'USPTO');
    assert.equal(valid.examinerReasoningText, 'Plain text examiner reasoning without HTML.');
    assert.equal(valid.sourcePublishedAt, '2026-05-15T10:00:00.000Z');
    assert.equal(valid.sourceUpdatedAt, '2026-05-15T12:00:00.000Z');

    assert.throws(() => validateIngestionRecord({
      sourceRegistry: 'USPTO',
      sourceReferenceId: 'ref-2',
      documentType: 'final_office_action',
      examinerReasoningText: '<script>alert(1)</script>',
    }));

    assert.throws(() => validateIngestionRecord({
      sourceRegistry: 'USPTO',
      sourceReferenceId: 'ref-3',
      documentType: 'final_office_action',
      sourceDocumentUrl: 'https://user:pass@tsdr.uspto.gov/doc.pdf?secret=1',
    }));

    assert.throws(() => validateIngestionRecord({
      sourceRegistry: 'USPTO',
      sourceReferenceId: 'ref-4',
      documentType: 'final_office_action',
      sourcePublishedAt: 'invalid-date',
    }));
  });

  it('ingests valid records idempotently, tracks corpus run ledger, and derives dataThrough', async () => {
    const db = new MockDatabase();
    const records = [
      {
        sourceRegistry: 'USPTO',
        sourceReferenceId: 'ref-100',
        applicationNumber: '88100100',
        markText: 'APEX',
        documentType: 'non_final_office_action',
        examinerReasoningText: 'Section 2(d) refusal text.',
        summaryMethod: 'registry',
        sourcePublishedAt: '2026-05-15T10:00:00Z',
        sourceUpdatedAt: '2026-05-15T12:00:00Z',
      },
    ];

    const stats = await ingestOfficeActionRecords(db, records);
    assert.equal(stats.processed, 1);
    assert.equal(stats.inserted, 1);
    assert.equal(stats.rejected, 0);
    assert.equal(stats.dataThrough, '2026-05-15');
    assert.equal(stats.runId, '11111111-1111-4111-8111-111111111111');

    const runInserts = db.queries.filter((q) => q.sql.includes('INSERT INTO office_action_corpus_runs'));
    const runUpdates = db.queries.filter((q) => q.sql.includes('UPDATE office_action_corpus_runs'));
    assert.equal(runInserts.length, 1);
    assert.equal(runUpdates.length, 1);
    assert.ok(runUpdates[0].sql.includes("status = 'complete'"));
  });

  it('fails corpus run ledger when all records are rejected', async () => {
    const db = new MockDatabase();
    const invalidRecords = [{ sourceRegistry: 'INVALID' }];
    await assert.rejects(
      async () => ingestOfficeActionRecords(db, invalidRecords),
      /All ingestion records were rejected/,
    );
    const runUpdates = db.queries.filter((q) => q.sql.includes('UPDATE office_action_corpus_runs'));
    assert.equal(runUpdates.length, 1);
    assert.equal(runUpdates[0].parameters[1], 'ALL_RECORDS_REJECTED');
  });
});

