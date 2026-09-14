import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { importUsptoBulkFile } from '../../src/ingestion/uspto-bulk-file-import.js';

const fixture = fileURLToPath(new URL('../fixtures/uspto/apc260105-verified-excerpt.xml', import.meta.url));

function repositories() {
  const batches = [];
  const calls = [];
  return {
    batches,
    calls,
    trademarkRepository: {
      async upsertBatch(records) {
        batches.push(records.map((record) => ({ ...record })));
        return records.length;
      },
    },
    refreshRepository: {
      async startRun(input) {
        calls.push(['startRun', input]);
        return { id: 'run-1' };
      },
      async markIngested(input) { calls.push(['markIngested', input]); },
      async markComplete(input) { calls.push(['markComplete', input]); },
      async markFailed(input) { calls.push(['markFailed', input]); },
    },
  };
}

describe('offline USPTO bulk file import', () => {
  it('imports normalized real-fixture records without an upstream API call', async () => {
    const repos = repositories();
    const result = await importUsptoBulkFile({
      inputPath: fixture,
      trademarkRepository: repos.trademarkRepository,
      refreshRepository: repos.refreshRepository,
      batchSize: 1,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.processedRecordCount, 2);
    assert.equal(result.changedRecordCount, 2);
    assert.equal(result.dataThroughDate, '2026-01-05');
    assert.equal(repos.batches.length, 2);
    assert.deepEqual(repos.batches[0][0], {
      sourceReferenceId: '98038829',
      markText: 'NIMBL VISUAL MEDIA & DESIGN',
      owner: 'Nimbl Marketing Co.',
      jurisdiction: 'US',
      niceClasses: [35, 41, 42],
      status: 'registered',
      rawStatusCode: '700',
      filingDate: '2023-06-12',
      sourceRegistry: 'USPTO',
      sourceUpdatedAt: '2026-01-05',
    });
    assert.equal(repos.calls.some(([name]) => name === 'markFailed'), false);
    const completed = repos.calls.find(([name]) => name === 'markComplete')?.[1];
    assert.equal(completed.dataThroughDate, '2026-01-05');
    assert.equal(completed.projectionBacklogCount, 0);
  });

  it('rejects unsupported input extensions before opening a refresh run', async () => {
    const repos = repositories();
    await assert.rejects(
      () => importUsptoBulkFile({
        inputPath: new URL('../fixtures/uspto/apc260105-verified-excerpt.xml', import.meta.url).pathname.replace(/\.xml$/, '.json'),
        trademarkRepository: repos.trademarkRepository,
        refreshRepository: repos.refreshRepository,
      }),
    );
    assert.equal(repos.calls.length, 0);
  });
});
