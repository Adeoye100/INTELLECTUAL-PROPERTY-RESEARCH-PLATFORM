import fs from 'node:fs';
import path from 'node:path';
import { loadConfigFromEnv } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { ingestOfficeActionRecords } from '../src/office-actions/office-action-ingestion.js';

function parseArgs(args) {
  let inputPath = null;
  let sourceRegistry = 'USPTO';
  let sourceKind = 'trademark-office-actions';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === '--source-registry' && i + 1 < args.length) {
      sourceRegistry = args[i + 1];
      i++;
    } else if (args[i] === '--source-kind' && i + 1 < args.length) {
      sourceKind = args[i + 1];
      i++;
    }
  }
  return { inputPath, sourceRegistry, sourceKind };
}

function parseFileContent(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }
  const stats = fs.statSync(absolutePath);
  if (stats.size > 50 * 1024 * 1024) {
    throw new Error('Input file exceeds 50MB size limit.');
  }
  const raw = fs.readFileSync(absolutePath, 'utf8').trim();
  if (!raw) return [];

  let records = [];
  if (filePath.endsWith('.ndjson') || raw.includes('\n')) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      records.push(JSON.parse(line));
    }
  } else {
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : [parsed];
  }

  if (records.length > 50000) {
    throw new Error('Input contains more than 50,000 records limit.');
  }

  return records;
}

async function main() {
  const { inputPath, sourceRegistry, sourceKind } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    console.error('Usage: pnpm ingest:office-actions -- --input <path> [--source-registry USPTO] [--source-kind trademark-office-actions]');
    process.exit(1);
  }

  const records = parseFileContent(inputPath);
  const config = loadConfigFromEnv(process.env);
  const pool = createPool(config.databaseUrl, config);

  try {
    const stats = await ingestOfficeActionRecords(pool, records, { sourceRegistry, sourceKind });
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});
