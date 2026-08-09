import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.js';
import { runMigrations } from './migration-runner.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseSsl = process.env.DATABASE_SSL === 'true';
if (!databaseUrl) throw new Error('Missing required environment variable: DATABASE_URL');

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../migrations');
const pool = createPool(databaseUrl, databaseSsl);

try {
  await runMigrations(pool, migrationsDirectory);
  console.log('Database migrations are up to date.');
} finally {
  await pool.end();
}
