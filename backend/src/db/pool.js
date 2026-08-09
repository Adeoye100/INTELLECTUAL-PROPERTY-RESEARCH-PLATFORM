import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString, ssl = false) {
  const options = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };

  if (ssl) {
    options.ssl = {
      rejectUnauthorized: false,
    };
  }

  return new Pool(options);
}
