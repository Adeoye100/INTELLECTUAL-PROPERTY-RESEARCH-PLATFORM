import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostgresOfficeActionSource } from '../../src/office-actions/postgres-office-action-source.js';

class EmptySearchDatabase {
  constructor({ corpusAvailable }) {
    this.corpusAvailable = corpusAvailable;
    this.calls = [];
  }

  async query(sql, parameters) {
    this.calls.push({ sql, parameters });
    if (sql.includes('SELECT EXISTS')) {
      return { rows: [{ available: this.corpusAvailable }] };
    }
    return { rows: [] };
  }
}

describe('PostgresOfficeActionSource corpus readiness', () => {
  it('returns a legitimate empty result when the corpus exists but the query has no match', async () => {
    const database = new EmptySearchDatabase({ corpusAvailable: true });
    const source = new PostgresOfficeActionSource({ database });
    const results = await source.searchOfficeActions({ markText: 'NO MATCH' });
    assert.deepEqual(results, []);
    assert.equal(database.calls.length, 2);
    assert.deepEqual(database.calls[1].parameters, ['USPTO']);
  });

  it('fails with OFFICE_ACTION_CORPUS_EMPTY when there is no persisted corpus', async () => {
    const database = new EmptySearchDatabase({ corpusAvailable: false });
    const source = new PostgresOfficeActionSource({ database });
    await assert.rejects(
      () => source.searchOfficeActions({ markText: 'ANY MARK' }),
      (error) => error?.code === 'OFFICE_ACTION_CORPUS_EMPTY',
    );
  });
});
