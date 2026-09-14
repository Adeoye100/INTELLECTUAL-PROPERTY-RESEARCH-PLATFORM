import { loadMigrationConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { RegistryRefreshRepository } from '../src/ingestion/registry-refresh-repository.js';
import { RegistryTrademarkRepository } from '../src/ingestion/registry-trademark-repository.js';
import { importUsptoBulkFile } from '../src/ingestion/uspto-bulk-file-import.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1];
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

const inputPath = argument('--input');
if (!inputPath) {
  console.error('Usage: pnpm import:uspto-bulk -- --input <official-uspto.xml|official-uspto.zip>');
  process.exit(1);
}

const config = loadMigrationConfig(process.env);
const pool = createPool(config.databaseUrl, config);
try {
  const result = await importUsptoBulkFile({
    inputPath,
    trademarkRepository: new RegistryTrademarkRepository(pool),
    refreshRepository: new RegistryRefreshRepository(pool),
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
