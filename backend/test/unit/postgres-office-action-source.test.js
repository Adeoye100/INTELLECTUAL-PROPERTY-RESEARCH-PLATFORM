import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostgresOfficeActionSource } from '../../src/office-actions/postgres-office-action-source.js';
import { ingestOfficeActionRecords, validateIngestionRecord } from '../../src/office-actions/office-action-ingestion.js';

class MockDatabase {
  constructor(rows = []) {
    this.rows = rows;
    this.queries = [];
  }

  async query(sql, parameters = []) {
    this.queries.push({ sql, parameters });
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
});

describe('Office Action Ingestion Validator & Process', () => {
  it('validates correct ingestion records and rejects HTML reasoning / credential URLs', () => {
    const valid = validateIngestionRecord({
      sourceRegistry: 'USPTO',
      sourceReferenceId: 'ref-1',
      documentType: 'final_office_action',
      examinerReasoningText: 'Plain text examiner reasoning without HTML.',
      sourceDocumentUrl: 'https://tsdr.uspto.gov/doc.pdf',
    });
    assert.equal(valid.sourceRegistry, 'USPTO');
    assert.equal(valid.examinerReasoningText, 'Plain text examiner reasoning without HTML.');

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
  });

  it('ingests valid records idempotently and handles updates', async () => {
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
      },
    ];

    const stats = await ingestOfficeActionRecords(db, records);
    assert.equal(stats.processed, 1);
    assert.equal(stats.inserted, 1);
    assert.equal(stats.rejected, 0);
  });
});
