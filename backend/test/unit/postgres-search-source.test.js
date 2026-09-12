import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostgresSearchSource } from '../../src/search/postgres-search-source.js';

describe('PostgresSearchSource', () => {
  it('builds a parameterized fuzzy/phonetic query and maps registry rows', async () => {
    let captured;
    const database = {
      async query(text, values) {
        captured = { text, values };
        return {
          rows: [{
            id: 'record-1',
            mark_text: 'FORGE GLOBAL',
            owner: 'Forge Global Inc.',
            jurisdiction: 'US',
            nice_classes: [35, 42],
            status: 'registered',
            filing_date: '2024-01-02',
            source_registry: 'USPTO',
            source_reference_id: '12345678',
            relevance_score: 88.5,
          }],
        };
      },
    };
    const source = new PostgresSearchSource({ sourceName: 'USPTO', database, maxResults: 25 });
    const results = await source.search({
      mark: 'Forge Global',
      jurisdictions: ['US'],
      niceClasses: [35],
      status: 'registered',
      owner: 'Forge',
      filedFrom: '2020-01-01',
      filedTo: '2026-12-31',
    });

    assert.match(captured.text, /mark_text % \$2/);
    assert.match(captured.text, /to_tsvector\('simple', mark_text\)/);
    assert.match(captured.text, /soundex\(mark_text\) = soundex\(\$2\)/);
    assert.match(captured.text, /nice_classes &&/);
    assert.equal(captured.values[0], 'USPTO');
    assert.equal(captured.values[1], 'Forge Global');
    assert.equal(captured.values.at(-1), 25);
    assert.deepEqual(results, [{
      recordId: 'record-1',
      markText: 'FORGE GLOBAL',
      owner: 'Forge Global Inc.',
      jurisdiction: 'US',
      niceClasses: [35, 42],
      status: 'registered',
      filingDate: '2024-01-02',
      sourceRegistry: 'USPTO',
      sourceReferenceId: '12345678',
      relevanceScore: 88.5,
    }]);
  });

  it('rejects empty mark input before querying the database', async () => {
    let called = false;
    const source = new PostgresSearchSource({
      sourceName: 'USPTO',
      database: { async query() { called = true; return { rows: [] }; } },
    });
    await assert.rejects(() => source.search({ mark: ' ' }), /requires mark text/);
    assert.equal(called, false);
  });
});
