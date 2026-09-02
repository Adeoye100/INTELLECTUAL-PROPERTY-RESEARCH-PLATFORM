import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig, loadSupabaseConfig, loadWorkerFeatureGate } from '../../src/config.js';

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
    for (const elasticsearchUrl of [undefined, 'ftp://localhost:9200', 'http://user:pass@localhost:9200', 'http://localhost:9200?x=1', 'http://localhost:9200#fragment', 'http://search.example.test:9200']) {
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

describe('Office Action search configuration', () => {
  it('defaults Office Action search to disabled without source configuration', () => {
    const config = loadConfig(applicationEnvironment());
    assert.equal(config.officeActionSearchEnabled, false);
    assert.deepEqual(config.officeActionSourceRegistries, []);
    assert.equal(config.officeActionSourceTimeoutMs, 3_000);
    assert.equal(config.officeActionSearchMaxResults, 25);
  });

  it('strictly validates enabled Office Action registries, timeout, and result bounds', () => {
    const enabled = loadConfig(applicationEnvironment({
      OFFICE_ACTION_SEARCH_ENABLED: 'true', OFFICE_ACTION_SOURCE_REGISTRIES: ' uspto,EU-IPO,USPTO ',
      OFFICE_ACTION_SOURCE_TIMEOUT_MS: '1500', OFFICE_ACTION_SEARCH_MAX_RESULTS: '20',
    }));
    assert.deepEqual(enabled.officeActionSourceRegistries, ['USPTO', 'EU-IPO']);
    assert.equal(enabled.officeActionSourceTimeoutMs, 1_500);
    assert.equal(enabled.officeActionSearchMaxResults, 20);
    for (const overrides of [
      { OFFICE_ACTION_SEARCH_ENABLED: 'yes' },
      { OFFICE_ACTION_SEARCH_ENABLED: 'true', OFFICE_ACTION_SOURCE_REGISTRIES: undefined },
      { OFFICE_ACTION_SEARCH_ENABLED: 'true', OFFICE_ACTION_SOURCE_REGISTRIES: 'EU IPO' },
      { OFFICE_ACTION_SEARCH_ENABLED: 'true', OFFICE_ACTION_SOURCE_REGISTRIES: 'USPTO', OFFICE_ACTION_SOURCE_TIMEOUT_MS: '99' },
      { OFFICE_ACTION_SEARCH_ENABLED: 'true', OFFICE_ACTION_SOURCE_REGISTRIES: 'USPTO', OFFICE_ACTION_SEARCH_MAX_RESULTS: '101' },
    ]) assert.throws(() => loadConfig(applicationEnvironment(overrides)));
  });
});

describe('Paystack billing configuration', () => {
  const enabled = {
    PAYSTACK_ENABLED: 'true', PAYSTACK_MODE: 'test', PAYSTACK_SECRET_KEY: 'sk_test_server_only_value',
    PAYSTACK_STARTER_PLAN_CODE: 'PLN_starter1', PAYSTACK_STARTER_AMOUNT_SUBUNIT: '250000', PAYSTACK_STARTER_CURRENCY: 'ngn',
    PAYSTACK_PROFESSIONAL_PLAN_CODE: 'PLN_professional1', PAYSTACK_PROFESSIONAL_AMOUNT_SUBUNIT: '750000', PAYSTACK_PROFESSIONAL_CURRENCY: 'NGN',
  };

  it('is disabled by default and exposes no secret', () => {
    const config = loadConfig(applicationEnvironment());
    assert.equal(config.paystackEnabled, false);
    assert.deepEqual(config.paystackPlans, {});
    assert.equal(config.paystackSecretKey, undefined);
  });

  it('loads strict server-priced plan configuration outside production', () => {
    const config = loadConfig(applicationEnvironment(enabled));
    assert.equal(config.paystackCallbackUrl, 'http://localhost:5173/admin/billing');
    assert.deepEqual(config.paystackPlans.starter, { tier: 'starter', planCode: 'PLN_starter1', amountSubunit: 250000, currency: 'NGN' });
  });

  it('rejects mode/key mismatches, malformed plans, and test mode in production', () => {
    assert.throws(() => loadConfig(applicationEnvironment({ ...enabled, PAYSTACK_SECRET_KEY: 'sk_live_wrong' })), /match PAYSTACK_MODE/);
    assert.throws(() => loadConfig(applicationEnvironment({ ...enabled, PAYSTACK_STARTER_AMOUNT_SUBUNIT: '0' })), /PAYSTACK_STARTER_AMOUNT_SUBUNIT/);
    assert.throws(() => loadConfig(applicationEnvironment({ ...enabled, PAYSTACK_STARTER_PLAN_CODE: 'bad' })), /PLAN_CODE/);
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

describe('production deployment configuration', () => {
  const productionEnvironment = (overrides = {}) => applicationEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://app:password@aws-region.pooler.supabase.com:5432/postgres',
    DATABASE_SSL: 'true',
    REDIS_URL: 'rediss://default:password@redis.provider.test:6380/0',
    CORS_ALLOWED_ORIGINS: 'https://app.iprp.test,https://preview.iprp.test',
    PUBLIC_APP_URL: 'https://app.iprp.test',
    TRUST_PROXY_HOPS: '1',
    SUPABASE_URL: 'https://project-ref.supabase.co',
    SUPABASE_SECRET_KEY: 'server-only-key-sufficiently-long-for-production',
    JWT_ACCESS_SECRET: 'production-access-secret-that-is-at-least-32-bytes',
    AUTH_RATE_LIMIT_KEY_SECRET: 'different-production-rate-limit-secret-32-bytes',
    ...overrides,
  });

  it('requires TLS, exact CORS origins, a Render proxy hop, and a bounded database pool', () => {
    const config = loadConfig(productionEnvironment({
      DATABASE_POOL_MAX: '12', DATABASE_IDLE_TIMEOUT_MS: '20000',
      DATABASE_CONNECTION_TIMEOUT_MS: '4000', DATABASE_STATEMENT_TIMEOUT_MS: '12000',
    }));
    assert.equal(config.databaseSsl, true);
    assert.deepEqual(config.corsAllowedOrigins, ['https://app.iprp.test', 'https://preview.iprp.test']);
    assert.equal(config.trustProxyHops, 1);
    assert.equal(config.databasePoolMax, 12);
    assert.equal(config.databaseStatementTimeoutMs, 12_000);
    assert.equal(config.httpHeadersTimeoutMs, 10_000);
    assert.equal(config.httpRequestTimeoutMs, 30_000);
    assert.equal(config.httpMaxHeadersCount, 100);
  });

  it('rejects unsafe production dependencies, placeholder values, and enabled filesystem exports', () => {
    for (const overrides of [
      { DATABASE_SSL: 'false' },
      { DATABASE_URL: 'postgresql://app:password@aws-region.pooler.supabase.com:5432/postgres?sslmode=disable' },
      { DATABASE_URL: 'postgresql://app:password@aws-region.pooler.supabase.com:5432/postgres?sslmode=prefer' },
      { DATABASE_URL: 'postgresql://app:password@aws-region.pooler.supabase.com:5432/postgres?sslmode=no-verify' },
      { REDIS_URL: 'redis://redis.provider.test:6379/0' },
      { CORS_ALLOWED_ORIGINS: 'https://app.iprp.test,https://app.iprp.test' },
      { CORS_ALLOWED_ORIGINS: 'http://app.iprp.test' },
      { TRUST_PROXY_HOPS: '0' },
      { DATABASE_URL: 'postgresql://app:password@your-project.invalid:5432/postgres' },
      { PDF_EXPORT_ENABLED: 'true', PDF_EXPORT_STORAGE_PROVIDER: 'filesystem', PDF_EXPORT_STORAGE_ROOT: '/private/exports' },
    ]) assert.throws(() => loadConfig(productionEnvironment(overrides)));
  });

  it('bounds HTTP connection limits and rejects an unsafe timeout relationship', () => {
    for (const overrides of [
      { HTTP_KEEP_ALIVE_TIMEOUT_MS: '999' },
      { HTTP_HEADERS_TIMEOUT_MS: '61000' },
      { HTTP_REQUEST_TIMEOUT_MS: '4000' },
      { HTTP_MAX_HEADERS_COUNT: '9' },
      { HTTP_MAX_HEADERS_COUNT: '201' },
      { HTTP_HEADERS_TIMEOUT_MS: '30001', HTTP_REQUEST_TIMEOUT_MS: '30000' },
    ]) assert.throws(() => loadConfig(productionEnvironment(overrides)));
  });
});

describe('disabled worker gates', () => {
  it('do not require the full runtime configuration while disabled', () => {
    assert.equal(loadWorkerFeatureGate({}, 'WATCH_ENABLED'), false);
    assert.equal(loadWorkerFeatureGate({}, 'PDF_EXPORT_ENABLED'), false);
    assert.throws(() => loadWorkerFeatureGate({ WATCH_ENABLED: 'yes' }, 'WATCH_ENABLED'));
    assert.throws(() => loadWorkerFeatureGate({}, 'SEARCH_ENABLED'));
  });
});
