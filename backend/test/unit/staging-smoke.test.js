import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseStagingSmokeConfig, runStagingSmoke } from '../../src/phase2/staging-smoke.js';

function environment(overrides = {}) {
  return {
    STAGING_API_URL: 'https://api.staging.example.test/api/v1',
    STAGING_ACCESS_TOKEN: 'read-token',
    STAGING_ADMIN_ACCESS_TOKEN: 'admin-token',
    ...overrides,
  };
}

function response(status, body = null) {
  return { status, async json() { return body; } };
}

describe('opt-in staging smoke runner', () => {
  it('requires named non-local staging configuration and separate test credentials', () => {
    assert.throws(() => parseStagingSmokeConfig({}), /STAGING_API_URL is required/);
    assert.throws(() => parseStagingSmokeConfig(environment({ STAGING_API_URL: 'http://localhost:3000' })), /non-local staging/);
    assert.throws(() => parseStagingSmokeConfig(environment({ STAGING_API_URL: 'https://api.example.com' })), /non-local staging/);
    assert.throws(() => parseStagingSmokeConfig(environment({ STAGING_ADMIN_ACCESS_TOKEN: undefined })), /STAGING_ADMIN_ACCESS_TOKEN/);
    assert.throws(() => parseStagingSmokeConfig(environment({ STAGING_SMOKE_ALLOW_MUTATIONS: 'true' })), /STAGING_MUTATION_ACCESS_TOKEN/);
    assert.equal(parseStagingSmokeConfig(environment()).apiUrl, 'https://api.staging.example.test/api/v1');
  });

  it('runs only bounded non-destructive reads by default and does not expose response bodies', async () => {
    const calls = [];
    const report = await runStagingSmoke({
      config: parseStagingSmokeConfig(environment()),
      fetchImplementation: async (url, options) => {
        calls.push({ url, method: options.method, authorization: options.headers.Authorization, redirect: options.redirect });
        return response(200, { accessToken: 'must-not-be-reported' });
      },
    });
    assert.equal(report.ok, true);
    assert.deepEqual(report.totals, { pass: 7, fail: 0, skip: 2 });
    assert.equal(calls.every((call) => call.method === 'GET'), true);
    assert.equal(calls.every((call) => call.authorization.startsWith('Bearer ')), true);
    assert.equal(calls.every((call) => call.redirect === 'error'), true);
    assert.equal(JSON.stringify(report).includes('must-not-be-reported'), false);
  });

  it('only cleans up the unique record returned by its own mutation create call', async () => {
    const calls = [];
    const createdId = '11111111-1111-4111-8111-111111111111';
    const config = parseStagingSmokeConfig(environment({
      STAGING_SMOKE_ALLOW_MUTATIONS: 'true', STAGING_MUTATION_ACCESS_TOKEN: 'mutate-token',
    }));
    const report = await runStagingSmoke({
      config,
      idGenerator: () => '22222222-2222-4222-8222-222222222222',
      fetchImplementation: async (url, options) => {
        calls.push({ url, method: options.method, body: options.body });
        if (options.method === 'POST') return response(201, { id: createdId, accessToken: 'secret' });
        return response(options.method === 'DELETE' ? 204 : 200);
      },
    });
    assert.equal(report.ok, true);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
    assert.equal(calls.some((call) => call.method === 'DELETE' && call.url.endsWith(`/${createdId}`)), true);
    assert.equal(calls.some((call) => call.method === 'DELETE' && !call.url.endsWith(`/${createdId}`)), false);
    assert.equal(JSON.stringify(report).includes('secret'), false);
  });

  it('fails safely without deleting anything when a create response lacks a UUID', async () => {
    const calls = [];
    const config = parseStagingSmokeConfig(environment({
      STAGING_SMOKE_ALLOW_MUTATIONS: 'true', STAGING_MUTATION_ACCESS_TOKEN: 'mutate-token',
    }));
    const report = await runStagingSmoke({
      config,
      fetchImplementation: async (url, options) => {
        calls.push({ url, method: options.method });
        if (options.method === 'POST') return response(201, { id: 'not-a-uuid' });
        return response(200);
      },
    });
    assert.equal(report.ok, false);
    assert.equal(report.results.some((result) => result.detail === 'CREATE_RESPONSE_ID_INVALID'), true);
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  });
});
