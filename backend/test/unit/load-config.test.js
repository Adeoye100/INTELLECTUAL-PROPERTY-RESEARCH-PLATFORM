import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertDashboardAggregateAvailable, loadTestConfig } from '../../load/config.js';

const testEnvironment = Object.freeze({
  LOAD_TEST_BASE_URL: 'https://api.staging.example.test', LOAD_TEST_ACCESS_TOKEN: 'test-token-only',
});

describe('safe load-test configuration', () => {
  it('defaults to a bounded smoke profile without exposing a token field', () => {
    const config = loadTestConfig({ scenario: 'smoke', p95TargetMs: 2_000, env: testEnvironment });
    assert.equal(config.profileName, 'smoke');
    assert.equal(config.options.stages.at(-1).target, 0);
    assert.equal(Object.keys(config).includes('token'), false);
    assert.match(config.headers.Authorization, /^Bearer /);
  });

  it('requires explicit opt-in for loopback, production-looking, and larger targets', () => {
    assert.throws(() => loadTestConfig({ scenario: 'smoke', p95TargetMs: 1, env: { ...testEnvironment, LOAD_TEST_BASE_URL: 'http://localhost:3000' } }));
    assert.throws(() => loadTestConfig({ scenario: 'smoke', p95TargetMs: 1, env: { ...testEnvironment, LOAD_TEST_BASE_URL: 'https://api.production.example.test' } }));
    assert.throws(() => loadTestConfig({ scenario: 'smoke', p95TargetMs: 1, env: { ...testEnvironment, LOAD_TEST_PROFILE: 'staged' } }));
  });

  it('refuses to invent a dashboard backend target', () => {
    assert.throws(() => assertDashboardAggregateAvailable(testEnvironment), /aggregate endpoint/);
  });
});
