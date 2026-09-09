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
  it('declares complete fail-closed Search, Office Action, Watch, and PDF Export variable contracts on iprp-api', async () => {
    const renderYaml = await readFile(new URL('../../../render.yaml', import.meta.url), 'utf8');
    const apiBlock = renderYaml.split('- type: web')[1]?.split('- type:')[0] || '';

    const requiredKeys = [
      'SEARCH_ENABLED',
      'ELASTICSEARCH_URL',
      'ELASTICSEARCH_INDEX',
      'SEARCH_SOURCE_REGISTRIES',
      'SEARCH_SOURCE_TIMEOUT_MS',
      'SEARCH_MAX_RESULTS',
      'SEARCH_REFRESH_EXPECTED_INTERVAL_HOURS',
      'SEARCH_MAX_MISSED_REFRESH_RUNS',
      'OFFICE_ACTION_SEARCH_ENABLED',
      'OFFICE_ACTION_SOURCE_REGISTRIES',
      'OFFICE_ACTION_SOURCE_TIMEOUT_MS',
      'OFFICE_ACTION_SEARCH_MAX_RESULTS',
      'WATCH_ENABLED',
      'PDF_EXPORT_ENABLED',
    ];

    for (const key of requiredKeys) {
      assert.ok(
        apiBlock.includes(`key: ${key}`),
        `render.yaml iprp-api service must declare envVar key: ${key}`,
      );
    }

    assert.ok(apiBlock.includes('key: SEARCH_ENABLED\n        value: "false"'));
    assert.ok(apiBlock.includes('key: OFFICE_ACTION_SEARCH_ENABLED\n        value: "false"'));
    assert.ok(apiBlock.includes('key: WATCH_ENABLED\n        value: "false"'));
    assert.ok(apiBlock.includes('key: PDF_EXPORT_ENABLED\n        value: "false"'));
  });
});

