import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluatePhase2Readiness } from '../../src/phase2/phase2-readiness.js';

function environment(overrides = {}) {
  return {
    DATABASE_URL: 'postgresql://localhost/iprp',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes',
    SUPABASE_URL: 'https://project-ref.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_unit_test',
    SUPABASE_JWT_VERIFICATION_MODE: 'jwks',
    SUPABASE_JWT_ALGORITHMS: 'ES256',
    AUTH_RATE_LIMIT_KEY_SECRET: 'separate-auth-rate-limit-test-secret-32b',
    SEARCH_ENABLED: 'true',
    ELASTICSEARCH_URL: 'https://search.example.test',
    SEARCH_SOURCE_REGISTRIES: 'USPTO,EUIPO',
    WATCH_ENABLED: 'true',
    ...overrides,
  };
}

describe('Phase 2 deployment readiness', () => {
  it('reuses application configuration validation without contacting infrastructure', () => {
    const result = evaluatePhase2Readiness(environment());
    assert.equal(result.ready, true);
    assert.equal(Object.values(result.checks).every((check) => check.ok), true);
    assert.deepEqual(result.gates, []);
  });

  it('reports missing application configuration as deployment gates', () => {
    const result = evaluatePhase2Readiness(environment({ DATABASE_URL: undefined }));
    assert.equal(result.ready, false);
    assert.equal(result.checks.postgresql.code, 'CONFIGURATION_INVALID');
    assert.match(result.checks.postgresql.message, /DATABASE_URL/);
  });

  it('requires enabled search and watch processing for Phase 2 staging verification', () => {
    const result = evaluatePhase2Readiness(environment({ SEARCH_ENABLED: 'false', WATCH_ENABLED: 'false' }));
    assert.equal(result.ready, false);
    assert.equal(result.checks.search.code, 'SEARCH_DISABLED');
    assert.equal(result.checks.watchWorker.code, 'WATCH_WORKER_DISABLED');
  });
});
