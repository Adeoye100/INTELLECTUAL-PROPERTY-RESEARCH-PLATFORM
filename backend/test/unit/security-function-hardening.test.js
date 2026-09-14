import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const migrationUrl = new URL('../../migrations/025_harden_public_functions.sql', import.meta.url);

describe('public function hardening migration', () => {
  it('pins trigger/helper search paths and revokes browser-role execution of security definers', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    for (const functionName of [
      'keep_alive',
      'reject_audit_logs_mutation',
      'reject_search_results_mutation',
    ]) {
      assert.match(sql, new RegExp(`ALTER FUNCTION public\\.${functionName}\\(\\) SET search_path = pg_catalog;`));
    }
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.keep_alive() FROM ${role};`));
      assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM ${role};`));
    }
  });
});
