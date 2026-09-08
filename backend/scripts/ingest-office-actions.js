import fs from 'node:fs';
import path from 'node:path';
import { loadConfigFromEnv } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { ingestOfficeActionRecords } from '../src/office-actions/office-action-ingestion.js';

function parseArgs(args) {
  let inputPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) {
      inputPath = args[i + 1];
      i++;
    }
  }
  return { inputPath };
}

function parseFileContent(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(absolutePath, 'utf8').trim();
  if (!raw) return [];

  if (filePath.endsWith('.ndjson') || raw.includes('\n')) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const records = [];
    for (const line of lines) {
      records.push(JSON.parse(line));
    }
    return records;
  }

  return JSON.parse(raw);
}

async function main() {
  const { inputPath } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    console.error('Usage: pnpm ingest:office-actions -- --input <path>');
    process.exit(1);
  }

  const records = parseFileContent(inputPath);
  const config = loadConfigFromEnv(process.env);
  const pool = createPool(config.databaseUrl, config);

  try {
    const stats = await ingestOfficeActionRecords(pool, records);
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});
