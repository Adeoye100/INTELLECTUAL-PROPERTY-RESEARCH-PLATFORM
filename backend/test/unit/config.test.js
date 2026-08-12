import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig, loadSupabaseConfig } from '../../src/config.js';

const jwksEnvironment = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_unit_test',
  SUPABASE_JWT_VERIFICATION_MODE: 'jwks',
  SUPABASE_JWT_ALGORITHMS: 'ES256',
};

describe('Supabase configuration', () => {
  it('loads an explicit asymmetric algorithm allow-list for jwks mode', () => {
    assert.deepEqual(loadSupabaseConfig({
      ...jwksEnvironment,
      SUPABASE_URL: 'https://project-ref.supabase.co/',
      SUPABASE_JWT_ALGORITHMS: 'ES256, RS256, ES256',
    }), {
      supabaseUrl: 'https://project-ref.supabase.co',
      supabasePublishableKey: undefined,
      supabaseSecretKey: 'sb_secret_unit_test',
      supabaseJwtVerificationMode: 'jwks',
      supabaseJwtAlgorithms: ['ES256', 'RS256'],
    });
  });

  it('includes the Supabase boundary in the application configuration', () => {
    const config = loadConfig({
      ...jwksEnvironment,
      DATABASE_URL: 'postgresql://localhost/iprp',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes',
    });

    assert.equal(config.supabaseUrl, 'https://project-ref.supabase.co');
    assert.equal(config.supabaseSecretKey, 'sb_secret_unit_test');
    assert.equal(config.supabaseJwtVerificationMode, 'jwks');
    assert.deepEqual(config.supabaseJwtAlgorithms, ['ES256']);
  });

  it('requires a publishable key in auth-server mode', () => {
    assert.throws(
      () => loadSupabaseConfig({
        SUPABASE_URL: 'https://project-ref.supabase.co',
        SUPABASE_JWT_VERIFICATION_MODE: 'auth-server',
      }),
      /SUPABASE_PUBLISHABLE_KEY/,
    );

    assert.deepEqual(loadSupabaseConfig({
      SUPABASE_URL: 'https://project-ref.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      SUPABASE_JWT_VERIFICATION_MODE: 'auth-server',
      SUPABASE_JWT_ALGORITHMS: 'HS256',
    }), {
      supabaseUrl: 'https://project-ref.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
      supabaseSecretKey: undefined,
      supabaseJwtVerificationMode: 'auth-server',
      supabaseJwtAlgorithms: [],
    });
  });

  it('requires a server-only secret key when protected routes use Supabase', () => {
    const environment = {
      ...jwksEnvironment,
      SUPABASE_SECRET_KEY: undefined,
      DATABASE_URL: 'postgresql://localhost/iprp',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes',
    };
    assert.throws(() => loadConfig(environment), /SUPABASE_SECRET_KEY/);
  });

  it('rejects an unsupported verification mode', () => {
    assert.throws(
      () => loadSupabaseConfig({
        ...jwksEnvironment,
        SUPABASE_JWT_VERIFICATION_MODE: 'token-header',
      }),
      /must be either jwks or auth-server/,
    );
  });

  it('rejects symmetric or unsupported algorithms in jwks mode', () => {
    for (const algorithm of ['HS256', 'none', 'EdDSA']) {
      assert.throws(
        () => loadSupabaseConfig({
          ...jwksEnvironment,
          SUPABASE_JWT_ALGORITHMS: algorithm,
        }),
        /only ES256 and\/or RS256/,
      );
    }
  });
});
