import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  importUsptoAnnualBaseline,
  importUsptoBulkFile,
  validateAnnualPartSet,
} from '../../src/ingestion/uspto-bulk-file-import.js';

const fixture = fileURLToPath(new URL('../fixtures/uspto/apc260105-verified-excerpt.xml', import.meta.url));
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

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

function annualFixtureSet(partCount = 2) {
  const dir = mkdtempSync(join(tmpdir(), 'iprp-uspto-annual-'));
  tempDirs.push(dir);
  const paths = [];
  for (let part = 1; part <= partCount; part += 1) {
    const target = join(dir, `apc18840407-20251231-${String(part).padStart(2, '0')}.xml`);
    copyFileSync(fixture, target);
    paths.push(target);
  }
  return paths;
}

describe('offline USPTO bulk file import', () => {
  it('imports a daily/incremental normalized real-fixture without an upstream API call', async () => {
    const repos = repositories();
    const result = await importUsptoBulkFile({
      inputPath: fixture,
      trademarkRepository: repos.trademarkRepository,
      refreshRepository: repos.refreshRepository,
      batchSize: 1,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.coverageKind, 'incremental');
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
    const started = repos.calls.find(([name]) => name === 'startRun')?.[1];
    assert.equal(started.coverageKind, 'incremental');
    assert.equal(started.expectedFileCount, 1);
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

  it('rejects a single annual snapshot part before any database write', async () => {
    const repos = repositories();
    const [part] = annualFixtureSet(1);
    await assert.rejects(
      () => importUsptoBulkFile({
        inputPath: part,
        trademarkRepository: repos.trademarkRepository,
        refreshRepository: repos.refreshRepository,
      }),
      (error) => error?.code === 'USPTO_ANNUAL_MULTIPART_SET_REQUIRED',
    );
    assert.equal(repos.calls.length, 0);
  });

  it('validates annual part completeness before any database write', () => {
    const [part1, part2] = annualFixtureSet(2);
    assert.throws(
      () => validateAnnualPartSet([part1, part2], 3),
      (error) => error?.code === 'USPTO_ANNUAL_PART_SET_INCOMPLETE',
    );
  });

  it('imports a complete annual multipart snapshot as one baseline ledger run', async () => {
    const repos = repositories();
    const parts = annualFixtureSet(2);
    const result = await importUsptoAnnualBaseline({
      inputPaths: parts,
      expectedPartCount: 2,
      trademarkRepository: repos.trademarkRepository,
      refreshRepository: repos.refreshRepository,
      batchSize: 2,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.coverageKind, 'baseline');
    assert.equal(result.sourceRelease, 'apc18840407-20251231');
    assert.equal(result.expectedPartCount, 2);
    assert.equal(result.discoveredFileCount, 2);
    assert.equal(result.processedRecordCount, 4);
    assert.equal(result.dataThroughDate, '2026-01-05');

    const started = repos.calls.find(([name]) => name === 'startRun')?.[1];
    assert.deepEqual(started, {
      sourceRegistry: 'USPTO',
      requestedSinceDate: '1884-04-07',
      coverageKind: 'baseline',
      sourceRelease: 'apc18840407-20251231',
      expectedFileCount: 2,
    });
    const ingested = repos.calls.find(([name]) => name === 'markIngested')?.[1];
    assert.equal(ingested.discoveredFileCount, 2);
    assert.equal(repos.calls.some(([name]) => name === 'markFailed'), false);
  });
});
