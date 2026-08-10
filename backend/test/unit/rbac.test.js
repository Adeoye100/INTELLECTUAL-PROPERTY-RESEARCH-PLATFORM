import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { requireFirm, requireRole } from '../../src/auth/middleware.js';
import { errorHandler } from '../../src/errors.js';

function testApp(role, { authenticated = Boolean(role) } = {}) {
  const app = express();
  app.get(
    '/protected',
    (req, _res, next) => {
      if (authenticated) req.auth = { userId: 'user-1', firmId: 'firm-1', role };
      next();
    },
    requireRole(['admin']),
    (_req, res) => res.json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

describe('requireRole', () => {
  it('allows a listed role', async () => {
    const response = await request(testApp('admin')).get('/protected');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
  });

  it('returns 403 for an authenticated but disallowed role', async () => {
    const response = await request(testApp('viewer')).get('/protected');
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'FORBIDDEN');
  });

  it('returns 403 when application authorization context has no valid role', async () => {
    for (const role of [undefined, 'authenticated', 'owner']) {
      const response = await request(testApp(role, { authenticated: true })).get('/protected');
      assert.equal(response.status, 403);
    }
  });

  it('returns 401 when verified authentication context is absent', async () => {
    const response = await request(testApp()).get('/protected');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHORIZED');
  });

  it('rejects an empty route policy at startup', () => {
    assert.throws(() => requireRole([]), /at least one allowed role/);
  });
});

describe('requireFirm', () => {
  function firmApp(authFirmId) {
    const app = express();
    app.get(
      '/firms/:firmId',
      (req, _res, next) => {
        req.auth = { userId: 'user-1', firmId: authFirmId, role: 'viewer' };
        next();
      },
      requireFirm(),
      (_req, res) => res.json({ ok: true }),
    );
    app.use(errorHandler);
    return app;
  }

  it('allows the trusted firm and denies cross-firm access', async () => {
    const firmA = '11111111-1111-4111-8111-111111111111';
    assert.equal((await request(firmApp(firmA)).get(`/firms/${firmA}`)).status, 200);
    const denied = await request(firmApp(firmA))
      .get('/firms/22222222-2222-4222-8222-222222222222');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'FORBIDDEN');
  });
});
