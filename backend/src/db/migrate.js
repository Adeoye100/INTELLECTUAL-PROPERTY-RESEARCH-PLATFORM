import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.js';
import { runMigrations } from './migration-runner.js';
import { loadMigrationConfig } from '../config.js';

const config = loadMigrationConfig();

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../migrations');
const pool = createPool(config.databaseUrl, config);

try {
  await runMigrations(pool, migrationsDirectory);
  console.log('Database migrations are up to date.');
} finally {
  await pool.end();
}
