import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostgresOfficeActionSource } from '../../src/office-actions/postgres-office-action-source.js';

describe('PostgresOfficeActionSource callback context', () => {
  it('preserves instance context when federated search stores searchOfficeActions as a callback', async () => {
    const calls = [];
    const database = {
      async query(sql, parameters) {
        calls.push({ sql, parameters });
        return {
          rows: [{
            source_registry: 'USPTO', source_reference_id: 'US-OA-1', application_number: '88123456',
            mark_text: 'FORGE', owner: 'Forge Holdings', jurisdiction: 'US',
            document_type: 'non_final_office_action', office_action_date: '2026-08-01',
            examiner_name: 'Examiner', examiner_reasoning_text: 'Section 2(d) refusal.',
            summary_method: 'registry', source_document_url: 'https://example.test/oa/1', source_metadata: {},
          }],
        };
      },
    };
    const source = new PostgresOfficeActionSource({ database, sourceName: 'USPTO', maximumResults: 25 });
    const detachedSearch = source.searchOfficeActions;

    const results = await detachedSearch({ markText: 'FORGE', jurisdictions: ['US'], maxResults: 5 });

    assert.equal(results.length, 1);
    assert.equal(results[0].sourceReferenceId, 'US-OA-1');
    assert.deepEqual(calls[0].parameters, ['USPTO', '%FORGE%', ['US'], 5]);
  });

  it('preserves context for the empty-corpus availability check', async () => {
    const database = {
      async query(sql) {
        if (sql.includes('SELECT EXISTS')) return { rows: [{ available: false }] };
        return { rows: [] };
      },
    };
    const source = new PostgresOfficeActionSource({ database, sourceName: 'USPTO' });
    const detachedSearch = source.searchOfficeActions;
    await assert.rejects(() => detachedSearch({ markText: 'FORGE' }), { code: 'OFFICE_ACTION_CORPUS_EMPTY' });
  });
});
