import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import {
  createResolveRoleAndFirm,
  createSupabaseAuthenticate,
  requireRole,
} from '../../src/auth/middleware.js';
import { errorHandler } from '../../src/errors.js';

function testApp(verifier, logger = { warn() {} }) {
  const app = express();
  app.get(
    '/identity',
    createSupabaseAuthenticate(verifier, logger),
    (req, res) => res.json({ auth: req.auth, user: req.user }),
  );
  app.use(errorHandler);
  return app;
}

describe('createSupabaseAuthenticate', () => {
  it('attaches the normalized verified identity to request.auth', async () => {
    const identity = {
      userId: 'user-1',
      email: 'user@example.test',
      supabaseRole: 'authenticated',
      sessionId: 'session-1',
      claims: { sub: 'user-1', role: 'authenticated' },
    };
    const verifier = {
      verifyAccessToken: async (token) => {
        assert.equal(token, 'valid-token');
        return identity;
      },
    };

    const response = await request(testApp(verifier))
      .get('/identity')
      .set('Authorization', 'Bearer valid-token');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { auth: identity, user: identity });
    assert.equal(response.body.auth.role, undefined);
    assert.equal(response.body.auth.firmId, undefined);
  });

  it('resolves membership after verification and attaches it to both request contexts', async () => {
    const identity = {
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.test',
      supabaseRole: 'authenticated',
      sessionId: null,
      claims: { sub: '11111111-1111-4111-8111-111111111111' },
    };
    const calls = [];
    const app = express();
    app.get(
      '/admin',
      createSupabaseAuthenticate({ verifyAccessToken: async () => identity }),
      createResolveRoleAndFirm({
        async resolveRoleAndFirm(userId, email) {
          calls.push({ userId, email });
          return { role: 'admin', firmId: '22222222-2222-4222-8222-222222222222' };
        },
      }),
      requireRole(['admin']),
      (req, res) => res.json({ auth: req.auth, user: req.user }),
    );
    app.use(errorHandler);

    const response = await request(app).get('/admin').set('Authorization', 'Bearer valid-token');
    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, 'admin');
    assert.equal(response.body.user.firmId, '22222222-2222-4222-8222-222222222222');
    assert.deepEqual(response.body.auth, response.body.user);
    assert.deepEqual(calls, [{ userId: identity.userId, email: identity.email }]);
  });

  it('does not treat a non-authenticated Supabase role as application authorization', async () => {
    let resolved = false;
    const app = express();
    app.get(
      '/admin',
      createSupabaseAuthenticate({
        verifyAccessToken: async () => ({
          userId: '11111111-1111-4111-8111-111111111111',
          email: 'user@example.test',
          supabaseRole: 'service_role',
          sessionId: null,
          claims: {},
        }),
      }),
      createResolveRoleAndFirm({
        async resolveRoleAndFirm() {
          resolved = true;
          return { role: 'admin', firmId: '22222222-2222-4222-8222-222222222222' };
        },
      }),
      requireRole(['admin']),
      (_req, res) => res.json({ ok: true }),
    );
    app.use(errorHandler);

    const response = await request(app).get('/admin').set('Authorization', 'Bearer valid-token');
    assert.equal(response.status, 403);
    assert.equal(resolved, false);
  });

  it('returns 403 for a verified identity with no linked local membership', async () => {
    const app = express();
    app.get(
      '/admin',
      createSupabaseAuthenticate({
        verifyAccessToken: async () => ({
          userId: '11111111-1111-4111-8111-111111111111',
          email: 'missing@example.test',
          supabaseRole: 'authenticated',
          sessionId: null,
          claims: {},
        }),
      }),
      createResolveRoleAndFirm({ resolveRoleAndFirm: async () => null }),
      requireRole(['admin']),
      (_req, res) => res.json({ ok: true }),
    );
    app.use(errorHandler);

    const response = await request(app).get('/admin').set('Authorization', 'Bearer valid-token');
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'FORBIDDEN');
  });

  it('returns the existing normalized 401 for a missing bearer token', async () => {
    const verifier = { verifyAccessToken: async () => assert.fail('must not verify') };
    const response = await request(testApp(verifier)).get('/identity');

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      code: 'UNAUTHORIZED',
      message: 'Authentication is required.',
    });
  });

  it('returns the existing normalized 401 for malformed authorization headers', async () => {
    const verifier = { verifyAccessToken: async () => assert.fail('must not verify') };
    for (const authorization of ['Basic value', 'Bearer', 'Bearer token with spaces']) {
      const response = await request(testApp(verifier))
        .get('/identity')
        .set('Authorization', authorization);
      assert.equal(response.status, 401);
      assert.equal(response.body.code, 'UNAUTHORIZED');
    }
  });

  it('logs only a safe verifier reason before returning 401', async () => {
    const rawToken = 'raw-token-must-not-be-logged';
    const warnings = [];
    const verifier = {
      verifyAccessToken: async () => {
        const error = new Error('Supabase access token is expired.');
        error.name = 'SupabaseVerificationError';
        error.code = 'SUPABASE_TOKEN_EXPIRED';
        throw error;
      },
    };

    const response = await request(testApp(verifier, {
      warn(message, details) {
        warnings.push({ message, details });
      },
    }))
      .get('/identity')
      .set('Authorization', `Bearer ${rawToken}`);

    assert.equal(response.status, 401);
    assert.deepEqual(warnings, [{
      message: 'Supabase authentication failed',
      details: {
        name: 'SupabaseVerificationError',
        code: 'SUPABASE_TOKEN_EXPIRED',
      },
    }]);
    assert.equal(JSON.stringify(warnings).includes(rawToken), false);
  });
});
