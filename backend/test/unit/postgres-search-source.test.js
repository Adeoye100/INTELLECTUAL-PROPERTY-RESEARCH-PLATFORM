import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { PostgresSearchSource } from '../../src/search/postgres-search-source.js';

const originalDemoMode = process.env.DEMO_READ_ONLY_MODE;
const originalIndexFriendlyMode = process.env.SEARCH_INDEX_FRIENDLY_MODE;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.DEMO_READ_ONLY_MODE;
  else process.env.DEMO_READ_ONLY_MODE = originalDemoMode;
  if (originalIndexFriendlyMode === undefined) delete process.env.SEARCH_INDEX_FRIENDLY_MODE;
  else process.env.SEARCH_INDEX_FRIENDLY_MODE = originalIndexFriendlyMode;
});

describe('PostgresSearchSource', () => {
  it('builds a parameterized fuzzy/phonetic query and maps registry rows', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'false';
    process.env.SEARCH_INDEX_FRIENDLY_MODE = 'false';
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

  it('uses adaptive bounded candidate branches in index-friendly mode', async () => {
    process.env.SEARCH_INDEX_FRIENDLY_MODE = 'true';
    let captured;
    const database = {
      async query(text, values) {
        captured = { text, values };
        return { rows: [] };
      },
    };
    const source = new PostgresSearchSource({ sourceName: 'USPTO', database, maxResults: 50 });
    await source.search({ mark: 'COCA-COLA', jurisdictions: ['US'], niceClasses: [9, 35, 42] });

    assert.match(captured.text, /WITH lexical_candidate_ids AS/);
    assert.match(captured.text, /lexical_count AS/);
    assert.match(captured.text, /phonetic_candidate_ids AS/);
    assert.match(captured.text, /fast_count AS/);
    assert.match(captured.text, /fuzzy_candidate_ids AS/);
    assert.match(captured.text, /lower\(mark_text\) = lower\(\$2\)/);
    assert.match(captured.text, /to_tsvector\('simple', mark_text\) @@ plainto_tsquery/);
    assert.match(captured.text, /\(SELECT value FROM lexical_count\) < \$5/);
    assert.match(captured.text, /soundex\(mark_text\) = soundex\(\$2\)/);
    assert.match(captured.text, /\(SELECT value FROM fast_count\) < \$5/);
    assert.match(captured.text, /mark_text % \$2/);
    assert.doesNotMatch(captured.text, /WHERE[\s\S]*lower\(mark_text\) = lower\(\$2\)[\s\S]*OR mark_text % \$2/);
    assert.equal(captured.values[0], 'USPTO');
    assert.equal(captured.values[1], 'COCA-COLA');
    assert.equal(captured.values.at(-2), 50);
    assert.equal(captured.values.at(-1), 200);
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
