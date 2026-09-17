import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const migrationUrl = new URL('../../migrations/027_revoke_browser_default_db_grants.sql', import.meta.url);

describe('browser-role database grant hardening migration', () => {
  it('revokes current and future table/sequence privileges from browser roles', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    for (const role of ['anon', 'authenticated']) {
      assert.ok(sql.includes(`role_name IN ARRAY ARRAY['anon', 'authenticated']`) || sql.includes("ARRAY['anon', 'authenticated']"));
      assert.ok(sql.includes('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public'));
      assert.ok(sql.includes('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public'));
      assert.ok(sql.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES'));
      assert.ok(sql.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES'));
      assert.ok(sql.includes("rolname = role_name"));
      assert.ok(role);
    }

    assert.ok(sql.includes('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC'));
    assert.ok(sql.includes('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC'));
    assert.ok(sql.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC'));
    assert.ok(sql.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC'));
  });
});
