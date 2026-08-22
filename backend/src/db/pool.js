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
      // A deployment must provide a trusted CA chain. Disabling verification
      // would make database credentials and tenant data MITM-susceptible.
      rejectUnauthorized: true,
    };
  }

  return new Pool(options);
}
