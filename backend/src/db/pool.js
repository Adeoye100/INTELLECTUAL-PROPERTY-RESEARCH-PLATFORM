import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

function resolveCaCertificate() {
  const candidates = [
    process.env.DATABASE_SSL_CA_PATH,
    process.env.NODE_EXTRA_CA_CERTS,
    path.resolve(process.cwd(), '.secret/prod-ca-2021.crt'),
    path.resolve(process.cwd(), 'backend/.secret/prod-ca-2021.crt'),
  ].filter(Boolean);

  for (const certPath of candidates) {
    try {
      if (fs.existsSync(certPath)) {
        return fs.readFileSync(certPath, 'utf8');
      }
    } catch {
      // Continue searching candidate paths
    }
  }
  return null;
}

function sanitizeConnectionStringForSsl(connectionString) {
  if (typeof connectionString !== 'string') return connectionString;
  try {
    const url = new URL(connectionString);
    if (url.searchParams.has('sslmode')) {
      url.searchParams.delete('sslmode');
      return url.toString();
    }
  } catch {
    // Return unchanged if not a standard parseable URL
  }
  return connectionString;
}

export function createPool(connectionString, settings = {}) {
  const normalized = typeof settings === 'boolean' ? { databaseSsl: settings } : settings;
  const {
    databaseSsl = false,
    databasePoolMax = 10,
    databaseIdleTimeoutMs = 30_000,
    databaseConnectionTimeoutMs = 5_000,
    databaseStatementTimeoutMs = 15_000,
    logger = console,
  } = normalized;

  let effectiveConnectionString = connectionString;
  const options = {
    connectionString,
    max: databasePoolMax,
    idleTimeoutMillis: databaseIdleTimeoutMs,
    connectionTimeoutMillis: databaseConnectionTimeoutMs,
    statement_timeout: databaseStatementTimeoutMs,
    query_timeout: databaseStatementTimeoutMs,
    idle_in_transaction_session_timeout: databaseStatementTimeoutMs,
  };

  if (databaseSsl) {
    effectiveConnectionString = sanitizeConnectionStringForSsl(connectionString);
    options.connectionString = effectiveConnectionString;
    const ca = resolveCaCertificate();
    options.ssl = {
      // A deployment must provide a trusted CA chain. Disabling verification
      // would make database credentials and tenant data MITM-susceptible.
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };
  }

  const pool = new Pool(options);
  pool.on('error', (error) => {
    logger.error('Unexpected idle PostgreSQL client error.', {
      name: error?.name ?? 'Error',
      code: error?.code ?? 'POSTGRES_CLIENT_ERROR',
    });
  });
  return pool;
}
