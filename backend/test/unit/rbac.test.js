import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { requireRole } from '../../src/auth/middleware.js';
import { errorHandler } from '../../src/errors.js';

function testApp(role) {
  const app = express();
  app.get(
    '/protected',
    (req, _res, next) => {
      if (role) req.auth = { userId: 'user-1', firmId: 'firm-1', role };
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

  it('returns 401 when verified authentication context is absent', async () => {
    const response = await request(testApp()).get('/protected');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHORIZED');
  });

  it('rejects an empty route policy at startup', () => {
    assert.throws(() => requireRole([]), /at least one allowed role/);
  });
});
