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
