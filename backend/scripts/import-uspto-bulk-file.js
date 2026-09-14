import fs from 'node:fs';
import path from 'node:path';
import { loadMigrationConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { RegistryRefreshRepository } from '../src/ingestion/registry-refresh-repository.js';
import { RegistryTrademarkRepository } from '../src/ingestion/registry-trademark-repository.js';
import {
  annualPartInfo,
  importUsptoAnnualBaseline,
  importUsptoBulkFile,
} from '../src/ingestion/uspto-bulk-file-import.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1];
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function usage() {
  console.error([
    'Usage:',
    '  Daily/incremental: pnpm import:uspto-bulk -- --input <official-uspto.xml|official-uspto.zip>',
    '  Annual baseline:   pnpm import:uspto-bulk -- --input-dir <directory> --expected-parts <count>',
  ].join('\n'));
}

const inputPath = argument('--input');
const inputDir = argument('--input-dir');
const expectedPartsRaw = argument('--expected-parts');
if ((inputPath && inputDir) || (!inputPath && !inputDir)) {
  usage();
  process.exit(1);
}

const config = loadMigrationConfig(process.env);
const pool = createPool(config.databaseUrl, config);
const trademarkRepository = new RegistryTrademarkRepository(pool);
const refreshRepository = new RegistryRefreshRepository(pool);

try {
  let result;
  if (inputDir) {
    const expectedPartCount = Number(expectedPartsRaw);
    if (!Number.isSafeInteger(expectedPartCount) || expectedPartCount < 1 || expectedPartCount > 999) {
      usage();
      process.exitCode = 1;
    } else {
      const absoluteDir = path.resolve(inputDir);
      const stat = fs.statSync(absoluteDir);
      if (!stat.isDirectory()) throw new Error('--input-dir must reference a directory.');
      const inputPaths = fs.readdirSync(absoluteDir)
        .map((name) => path.join(absoluteDir, name))
        .filter((candidate) => annualPartInfo(candidate));
      result = await importUsptoAnnualBaseline({
        inputPaths,
        expectedPartCount,
        trademarkRepository,
        refreshRepository,
      });
    }
  } else {
    result = await importUsptoBulkFile({
      inputPath,
      trademarkRepository,
      refreshRepository,
    });
  }
  if (result) console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
