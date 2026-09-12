import { loadUsptoSearchRefreshConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { loadUsptoBulkSourceConfig } from '../registries/uspto/odp-config.js';
import { executeUsptoSearchRefresh } from './uspto-search-refresh-service.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1];
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

const sinceValue = argument('--since');
if (process.argv.some((value) => value === '--since' || value.startsWith('--since=')) && !sinceValue) {
  throw new Error('--since requires a YYYY-MM-DD value.');
}
if (sinceValue && !/^\d{4}-\d{2}-\d{2}$/.test(sinceValue)) {
  throw new Error('--since must use YYYY-MM-DD format.');
}

const config = {
  ...loadUsptoSearchRefreshConfig(),
  ...loadUsptoBulkSourceConfig(),
};
const pool = createPool(config.databaseUrl, config);

try {
  const result = await executeUsptoSearchRefresh({
    pool,
    config,
    sinceOverride: sinceValue || null,
  });
  if (result.status === 'already_running') process.exit(0);
} catch (error) {
  console.error('USPTO search refresh command failed', {
    name: error?.name ?? 'Error',
    code: error?.code ?? 'UNKNOWN',
  });
  process.exit(1);
} finally {
  await pool.end();
}
