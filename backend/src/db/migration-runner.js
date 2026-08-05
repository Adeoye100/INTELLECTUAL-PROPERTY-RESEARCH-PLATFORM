import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_LOCK_ID = 8_621_430_501;

const checksum = (source) => createHash('sha256').update(source).digest('hex');

export async function runMigrations(pool, migrationsDirectory) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const names = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();

    for (const name of names) {
      const source = await readFile(path.join(migrationsDirectory, name), 'utf8');
      const digest = checksum(source);
      const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [name],
      );

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== digest) {
          throw new Error(`Applied migration ${name} has been modified.`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(source);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, digest],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}
