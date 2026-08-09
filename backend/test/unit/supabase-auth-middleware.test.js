import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createSupabaseAuthenticate } from '../../src/auth/middleware.js';
import { errorHandler } from '../../src/errors.js';

function testApp(verifier, logger = { warn() {} }) {
  const app = express();
  app.get(
    '/identity',
    createSupabaseAuthenticate(verifier, logger),
    (req, res) => res.json(req.auth),
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
    assert.deepEqual(response.body, identity);
    assert.equal(response.body.role, undefined);
    assert.equal(response.body.firmId, undefined);
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
