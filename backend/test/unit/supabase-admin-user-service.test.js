import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SupabaseAdminUserService } from '../../src/auth/supabase-admin-user-service.js';

const supabaseUserId = '11111111-1111-4111-8111-111111111111';
const secretKey = 'server-only-test-key';

describe('SupabaseAdminUserService', () => {
  it('returns the authoritative confirmed-email state using server credentials', async () => {
    let observedRequest;
    const service = new SupabaseAdminUserService({
      supabaseUrl: 'https://project-ref.supabase.co/',
      secretKey,
      async fetchImplementation(url, options) {
        observedRequest = { url, options };
        return new Response(JSON.stringify({
          id: supabaseUserId,
          email: 'confirmed@example.test',
          email_confirmed_at: '2026-08-10T09:00:00.000Z',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });

    assert.deepEqual(await service.getAuthoritativeUser(supabaseUserId), {
      email: 'confirmed@example.test',
      emailConfirmed: true,
    });
    assert.equal(
      observedRequest.url,
      `https://project-ref.supabase.co/auth/v1/admin/users/${supabaseUserId}`,
    );
    assert.equal(observedRequest.options.method, 'GET');
    assert.equal(observedRequest.options.redirect, 'error');
    assert.equal(observedRequest.options.headers.authorization, `Bearer ${secretKey}`);
    assert.equal(observedRequest.options.headers.apikey, secretKey);
  });

  it('reports a null confirmation timestamp as unconfirmed', async () => {
    const service = new SupabaseAdminUserService({
      supabaseUrl: 'https://project-ref.supabase.co',
      secretKey,
      async fetchImplementation() {
        return new Response(JSON.stringify({
          id: supabaseUserId,
          email: 'unconfirmed@example.test',
          email_confirmed_at: null,
        }), { status: 200 });
      },
    });

    assert.deepEqual(await service.getAuthoritativeUser(supabaseUserId), {
      email: 'unconfirmed@example.test',
      emailConfirmed: false,
    });
  });

  it('rejects non-success and malformed Admin API responses', async () => {
    const rejected = new SupabaseAdminUserService({
      supabaseUrl: 'https://project-ref.supabase.co',
      secretKey,
      async fetchImplementation() { return new Response(null, { status: 403 }); },
    });
    await assert.rejects(
      () => rejected.getAuthoritativeUser(supabaseUserId),
      (error) => error.code === 'SUPABASE_ADMIN_REJECTED',
    );

    const malformed = new SupabaseAdminUserService({
      supabaseUrl: 'https://project-ref.supabase.co',
      secretKey,
      async fetchImplementation() {
        return new Response(JSON.stringify({ id: 'different-user', email: 'user@example.test' }), {
          status: 200,
        });
      },
    });
    await assert.rejects(
      () => malformed.getAuthoritativeUser(supabaseUserId),
      (error) => error.code === 'SUPABASE_ADMIN_RESPONSE_INVALID',
    );
  });
});
