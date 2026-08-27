import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString, settings = {}) {
  const normalized = typeof settings === 'boolean' ? { databaseSsl: settings } : settings;
  const {
    databaseSsl = false,
    databasePoolMax = 10,
    databaseIdleTimeoutMs = 30_000,
    databaseConnectionTimeoutMs = 5_000,
    databaseStatementTimeoutMs = 15_000,
  } = normalized;
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
    options.ssl = {
      // A deployment must provide a trusted CA chain. Disabling verification
      // would make database credentials and tenant data MITM-susceptible.
      rejectUnauthorized: true,
    };
  }

  return new Pool(options);
}
