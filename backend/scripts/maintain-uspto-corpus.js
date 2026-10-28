import { loadMigrationConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import {
  dropPostgresTrademarkSearchIndexes,
  getUsptoCorpusPrunePreview,
  pruneInactiveUsptoRecords,
} from '../src/ingestion/uspto-corpus-maintenance.js';

const apply = process.argv.includes('--apply');
const dropIndexes = process.argv.includes('--drop-search-indexes');
const config = loadMigrationConfig();
const pool = createPool(config.databaseUrl, config);

try {
  const preview = await getUsptoCorpusPrunePreview({ pool });
  console.log('USPTO corpus prune preview', preview);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to delete inactive USPTO rows.');
  } else {
    const result = await pruneInactiveUsptoRecords({ pool, apply: true });
    console.log('Inactive USPTO rows deleted', result);
    await pool.query('ANALYZE public.registry_trademarks');
    console.log('PostgreSQL trademark statistics refreshed.');
  }

  if (dropIndexes) {
    if (!apply) throw new Error('--drop-search-indexes requires --apply.');
    const result = await dropPostgresTrademarkSearchIndexes({ pool });
    console.log('Optional PostgreSQL trademark search indexes dropped', result);
    console.log('Run ANALYZE public.registry_trademarks after the operation and verify Elasticsearch search before changing any other schema.');
  }
} finally {
  await pool.end();
}
