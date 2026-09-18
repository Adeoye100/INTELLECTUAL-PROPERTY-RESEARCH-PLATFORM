import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const publicBusinessTables = [
  'firms', 'users', 'registry_trademarks', 'firm_invitations', 'portfolio_marks',
  'watches', 'risk_scores', 'alerts', 'audit_logs', 'office_action_refs',
  'search_results', 'exports', 'schema_migrations',
];

describe('initial-deployment database boundary', () => {
  it('keeps public business tables deny-by-default behind RLS without browser policies', async () => {
    const migration = await readFile(new URL('../../migrations/013_enable_public_schema_rls.sql', import.meta.url), 'utf8');
    for (const table of publicBusinessTables) {
      assert.match(migration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`));
    }
    assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I/);
    assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC/);
    assert.equal(/CREATE\s+POLICY/i.test(migration), false);
  });
});

describe('Render blueprint configuration contracts', () => {
  it('activates database-backed research, in-process Watch automation, and server reports while upstream refresh and billing stay fail-closed', async () => {
    const renderYaml = await readFile(new URL('../../../render.yaml', import.meta.url), 'utf8');
    const apiBlock = renderYaml.split('- type: web')[1]?.split('- type:')[0] || '';

    const requiredKeys = [
      'SEARCH_ENABLED',
      'SEARCH_BACKEND',
      'SEARCH_FRESHNESS_MODE',
      'ELASTICSEARCH_URL',
      'ELASTICSEARCH_INDEX',
      'SEARCH_SOURCE_REGISTRIES',
      'SEARCH_SOURCE_TIMEOUT_MS',
      'SEARCH_MAX_RESULTS',
      'SEARCH_REFRESH_EXPECTED_INTERVAL_HOURS',
      'SEARCH_MAX_MISSED_REFRESH_RUNS',
      'USPTO_BULK_SOURCE',
      'USPTO_BDSS_API_BASE_URL',
      'USPTO_BDSS_DAILY_PRODUCT',
      'USPTO_LISTING_BASELINE_DAYS',
      'USPTO_REFRESH_IN_PROCESS_ENABLED',
      'OFFICE_ACTION_SEARCH_ENABLED',
      'OFFICE_ACTION_SOURCE_REGISTRIES',
      'OFFICE_ACTION_SOURCE_TIMEOUT_MS',
      'OFFICE_ACTION_SEARCH_MAX_RESULTS',
      'WATCH_ENABLED',
      'WATCH_IN_PROCESS_ENABLED',
      'PDF_EXPORT_ENABLED',
      'PDF_EXPORT_IN_PROCESS_ENABLED',
      'PAYSTACK_ENABLED',
    ];

    for (const key of requiredKeys) {
      assert.ok(
        apiBlock.includes(`key: ${key}`),
        `render.yaml iprp-api service must declare envVar key: ${key}`,
      );
    }

    assert.ok(apiBlock.includes('key: SEARCH_ENABLED\n        value: "true"'));
    assert.ok(apiBlock.includes('key: SEARCH_BACKEND\n        value: postgres'));
    assert.ok(apiBlock.includes('key: SEARCH_FRESHNESS_MODE\n        value: corpus'));
    assert.ok(apiBlock.includes('key: USPTO_REFRESH_IN_PROCESS_ENABLED\n        value: "false"'));
    assert.ok(apiBlock.includes('key: OFFICE_ACTION_SEARCH_ENABLED\n        value: "true"'));
    assert.ok(apiBlock.includes('key: PDF_EXPORT_ENABLED\n        value: "true"'));
    assert.ok(apiBlock.includes('key: PDF_EXPORT_IN_PROCESS_ENABLED\n        value: "true"'));

    assert.ok(apiBlock.includes('key: WATCH_ENABLED\n        value: "true"'));
    assert.ok(apiBlock.includes('key: WATCH_IN_PROCESS_ENABLED\n        value: "true"'));
    assert.ok(apiBlock.includes('key: PAYSTACK_ENABLED\n        value: "false"'));
    assert.ok(apiBlock.includes(
      'key: REDIS_URL\n        fromService:\n          name: iprp-redis\n          type: keyvalue\n          property: connectionString',
    ));
    assert.equal(apiBlock.includes('key: REDIS_URL\n        sync: false'), false);
  });
});
