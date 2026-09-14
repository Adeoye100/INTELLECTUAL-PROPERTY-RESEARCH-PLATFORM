import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const migrationUrl = new URL('../../migrations/025_harden_public_functions.sql', import.meta.url);

describe('public function hardening migration', () => {
  it('pins function search paths and revokes browser-role execution only when Supabase helpers exist', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    for (const functionName of [
      'keep_alive',
      'reject_audit_logs_mutation',
      'reject_search_results_mutation',
    ]) {
      assert.ok(sql.includes(`ALTER FUNCTION public.${functionName}() SET search_path = pg_catalog`));
      assert.ok(sql.includes(`to_regprocedure('public.${functionName}()')`));
    }
    assert.ok(sql.includes("to_regprocedure('public.rls_auto_enable()')"));
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.keep_alive() FROM ${role}`));
      assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM ${role}`));
    }
    assert.ok(sql.includes("rolname = 'anon'"));
    assert.ok(sql.includes("rolname = 'authenticated'"));
  });
});
