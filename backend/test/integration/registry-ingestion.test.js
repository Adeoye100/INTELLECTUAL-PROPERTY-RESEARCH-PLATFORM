import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../../src/db/migration-runner.js';
import { createPool } from '../../src/db/pool.js';
import { ingestRegistryUpdates } from '../../src/ingestion/ingest-registry.js';
import { RegistryTrademarkRepository } from '../../src/ingestion/registry-trademark-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    'Real PostgreSQL integration storage is required. Set TEST_DATABASE_URL; '
    + 'the documented compose setup provides it.',
  );
}

const sourceReferenceId = randomUUID();
let pool;
let repository;

function adapterFor(markText) {
  return {
    sourceName: 'USPTO Bulk XML integration fixture',
    async *fetchUpdates() {
      yield {
        sourceReferenceId,
        markText,
        owner: 'Nimbl Marketing Co.',
        jurisdiction: 'US',
        niceClasses: [35, 41, 42],
        status: 'registered',
        rawStatusCode: '700',
        filingDate: '2023-06-12',
        sourceRegistry: 'USPTO',
        sourceUpdatedAt: '2026-01-05',
      };
    },
  };
}

before(async () => {
  pool = createPool(databaseUrl);
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  await runMigrations(pool, path.resolve(currentDirectory, '../../migrations'));
  repository = new RegistryTrademarkRepository(pool);
});

after(async () => {
  if (!pool) return;
  await pool.query(
    'DELETE FROM registry_trademarks WHERE source_reference_id = $1',
    [sourceReferenceId],
  );
  await pool.end();
});

describe('USPTO PostgreSQL-first ingestion', () => {
  it('upserts attributed records idempotently and exposes changes for later projection', async () => {
    const first = await ingestRegistryUpdates({
      adapter: adapterFor('NIMBL VISUAL MEDIA & DESIGN'),
      repository,
      since: new Date('2026-01-05'),
    });
    assert.equal(first.processed, 1);
    assert.equal(first.changed, 1);

    const stored = await pool.query(`
      SELECT
        mark_text,
        jurisdiction,
        nice_classes,
        status,
        filing_date::text,
        source_registry,
        elasticsearch_synced_at
      FROM registry_trademarks
      WHERE source_registry = 'USPTO' AND source_reference_id = $1
    `, [sourceReferenceId]);
    assert.deepEqual(stored.rows[0], {
      mark_text: 'NIMBL VISUAL MEDIA & DESIGN',
      jurisdiction: 'US',
      nice_classes: [35, 41, 42],
      status: 'registered',
      filing_date: '2023-06-12',
      source_registry: 'USPTO',
      elasticsearch_synced_at: null,
    });

    const unchanged = await ingestRegistryUpdates({
      adapter: adapterFor('NIMBL VISUAL MEDIA & DESIGN'),
      repository,
      since: new Date('2026-01-05'),
    });
    assert.equal(unchanged.changed, 0);

    const changed = await ingestRegistryUpdates({
      adapter: adapterFor('NIMBL VISUAL MEDIA AND DESIGN'),
      repository,
      since: new Date('2026-01-05'),
    });
    assert.equal(changed.changed, 1);
    assert.equal(
      (await pool.query(
        'SELECT mark_text FROM registry_trademarks WHERE source_reference_id = $1',
        [sourceReferenceId],
      )).rows[0].mark_text,
      'NIMBL VISUAL MEDIA AND DESIGN',
    );
  });
});
