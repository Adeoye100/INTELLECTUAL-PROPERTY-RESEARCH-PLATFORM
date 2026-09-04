import { loadUsptoIngestionConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { UsptoBulkXmlAdapter } from '../registries/uspto/bulk-xml-adapter.js';
import { ingestRegistryUpdates } from './ingest-registry.js';
import { RegistryTrademarkRepository } from './registry-trademark-repository.js';

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
const config = loadUsptoIngestionConfig();
const since = sinceValue ? new Date(`${sinceValue}T00:00:00.000Z`) : (() => {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - config.usptoIngestionOverlapDays);
  return value;
})();
if (Number.isNaN(since.getTime()) || (sinceValue && since.toISOString().slice(0, 10) !== sinceValue)) {
  throw new Error('--since must be a valid calendar date.');
}

const pool = createPool(config.databaseUrl, config);
try {
  const adapter = new UsptoBulkXmlAdapter({
    listingUrl: config.usptoBulkListingUrl,
  });
  const result = await ingestRegistryUpdates({
    adapter,
    repository: new RegistryTrademarkRepository(pool),
    since,
  });
  console.log('USPTO ingestion complete', { ...result, since: since.toISOString().slice(0, 10) });
} finally {
  await pool.end();
}
