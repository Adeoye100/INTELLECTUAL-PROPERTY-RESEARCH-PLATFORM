import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig, loadSupabaseConfig } from '../../src/config.js';

const jwksEnvironment = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_unit_test',
  SUPABASE_JWT_VERIFICATION_MODE: 'jwks',
  SUPABASE_JWT_ALGORITHMS: 'ES256',
};

function applicationEnvironment(overrides = {}) {
  return {
    ...jwksEnvironment,
    DATABASE_URL: 'postgresql://localhost/iprp',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes',
    AUTH_RATE_LIMIT_KEY_SECRET: 'separate-auth-rate-limit-test-secret-32b',
    ...overrides,
  };
}

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
    const config = loadConfig(applicationEnvironment());

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
      AUTH_RATE_LIMIT_KEY_SECRET: 'separate-auth-rate-limit-test-secret-32b',
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

describe('search configuration', () => {
  it('defaults search to disabled without requiring Elasticsearch variables', () => {
    const config = loadConfig(applicationEnvironment());
    assert.equal(config.searchEnabled, false);
    assert.equal(config.elasticsearchUrl, undefined);
    assert.deepEqual(config.searchSourceRegistries, []);
    assert.equal(config.searchSourceTimeoutMs, 3_000);
    assert.equal(config.searchMaxResults, 50);
  });

  it('requires a valid Elasticsearch URL and registry list when enabled', () => {
    for (const elasticsearchUrl of [undefined, 'ftp://localhost:9200', 'http://user:pass@localhost:9200', 'http://localhost:9200?x=1', 'http://localhost:9200#fragment']) {
      assert.throws(() => loadConfig(applicationEnvironment({
        SEARCH_ENABLED: 'true', ELASTICSEARCH_URL: elasticsearchUrl, SEARCH_SOURCE_REGISTRIES: 'USPTO',
      })), /ELASTICSEARCH_URL/);
    }
    assert.throws(() => loadConfig(applicationEnvironment({ SEARCH_ENABLED: 'true', ELASTICSEARCH_URL: 'http://localhost:9200' })), /SEARCH_SOURCE_REGISTRIES/);
  });

  it('normalizes and deduplicates configured registries', () => {
    const config = loadConfig(applicationEnvironment({
      SEARCH_ENABLED: 'true', ELASTICSEARCH_URL: 'https://search.example.test/',
      SEARCH_SOURCE_REGISTRIES: ' uspto,EU-IPO,USPTO ',
    }));
    assert.equal(config.elasticsearchUrl, 'https://search.example.test');
    assert.deepEqual(config.searchSourceRegistries, ['USPTO', 'EU-IPO']);
  });

  it('rejects invalid flags and empty, malformed, or excessive registry lists', () => {
    assert.throws(() => loadConfig(applicationEnvironment({ SEARCH_ENABLED: 'yes' })), /SEARCH_ENABLED/);
    for (const registries of ['', 'USPTO,,EUIPO', 'EU IPO', Array.from({ length: 21 }, (_, index) => `REG${index}`).join(',')]) {
      assert.throws(() => loadConfig(applicationEnvironment({
        SEARCH_ENABLED: 'true', ELASTICSEARCH_URL: 'http://localhost:9200', SEARCH_SOURCE_REGISTRIES: registries,
      })), /SEARCH_SOURCE_REGISTRIES/);
    }
  });

  it('validates search timeout and result limits', () => {
    const base = { SEARCH_ENABLED: 'true', ELASTICSEARCH_URL: 'http://localhost:9200', SEARCH_SOURCE_REGISTRIES: 'USPTO' };
    for (const overrides of [
      { SEARCH_SOURCE_TIMEOUT_MS: '0' }, { SEARCH_SOURCE_TIMEOUT_MS: '99' }, { SEARCH_SOURCE_TIMEOUT_MS: '60001' },
      { SEARCH_MAX_RESULTS: '0' }, { SEARCH_MAX_RESULTS: '101' },
    ]) {
      assert.throws(() => loadConfig(applicationEnvironment({ ...base, ...overrides }), /must be/));
    }
  });
});

describe('authentication rate-limit configuration', () => {
  it('loads the versioned default policies and direct-connection proxy default', () => {
    const config = loadConfig(applicationEnvironment());
    assert.equal(config.authRateLimitEnabled, true);
    assert.equal(config.trustProxyHops, 0);
    assert.deepEqual(config.authRateLimitPolicies.loginIp, { limit: 20, windowSeconds: 900 });
    assert.deepEqual(config.authRateLimitPolicies.loginIdentity, { limit: 5, windowSeconds: 900 });
    assert.deepEqual(config.authRateLimitPolicies.recoveryIp, { limit: 5, windowSeconds: 3600 });
    assert.deepEqual(config.authRateLimitPolicies.refreshSession, { limit: 30, windowSeconds: 300 });
  });

  it('rejects missing, weak, reused, invalid, and unsafe limiter configuration', () => {
    for (const overrides of [
      { AUTH_RATE_LIMIT_KEY_SECRET: undefined },
      { AUTH_RATE_LIMIT_KEY_SECRET: 'too-short' },
      { AUTH_RATE_LIMIT_KEY_SECRET: 'unit-test-secret-that-is-at-least-32-bytes' },
      { AUTH_RATE_LIMIT_ENABLED: 'yes' },
      { AUTH_LOGIN_IP_LIMIT: '0' },
      { AUTH_LOGIN_WINDOW_SECONDS: '86401' },
      { TRUST_PROXY_HOPS: '-1' },
      { TRUST_PROXY_HOPS: '11' },
    ]) {
      assert.throws(() => loadConfig(applicationEnvironment(overrides)));
    }
  });

  it('allows an explicitly disabled limiter only in development or test', () => {
    const disabled = loadConfig(applicationEnvironment({
      NODE_ENV: 'test', AUTH_RATE_LIMIT_ENABLED: 'false', AUTH_RATE_LIMIT_KEY_SECRET: undefined,
    }));
    assert.equal(disabled.authRateLimitEnabled, false);
    assert.throws(() => loadConfig(applicationEnvironment({
      AUTH_RATE_LIMIT_ENABLED: 'false', AUTH_RATE_LIMIT_KEY_SECRET: undefined,
    })), /only in development or test/);
  });
});
