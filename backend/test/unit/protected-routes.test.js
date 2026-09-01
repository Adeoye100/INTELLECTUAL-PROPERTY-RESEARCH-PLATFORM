import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { forbidden, unauthorized, errorHandler } from '../../src/errors.js';
import { createProtectedRouter } from '../../src/routes/protected-routes.js';

const admin = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.test',
  role: 'admin',
  firmId: '22222222-2222-4222-8222-222222222222',
  ignored: 'must not be exposed',
};
const viewer = { ...admin, role: 'viewer' };

function testApp() {
  const authenticate = (request, _response, next) => {
    const token = request.get('authorization');
    if (token === 'Bearer admin-token') {
      request.auth = admin;
      return next();
    }
    if (token === 'Bearer viewer-token') {
      request.auth = viewer;
      return next();
    }
    return next(unauthorized());
  };
  const app = express();
  app.use('/api/v1', createProtectedRouter(authenticate, { includeDiagnosticRoutes: true }));
  app.use(errorHandler);
  return app;
}

describe('protected routes', () => {
  it('does not mount diagnostic ping routes by default', async () => {
    const authenticate = (_request, _response, next) => next();
    const app = express();
    app.use('/api/v1', createProtectedRouter(authenticate));
    const response = await request(app).get('/api/v1/admin/ping');
    assert.equal(response.status, 404);
  });

  it('returns the minimal resolved identity from authenticated GET /me', async () => {
    const response = await request(testApp())
      .get('/api/v1/me')
      .set('Authorization', 'Bearer admin-token');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      userId: admin.userId,
      email: admin.email,
      role: admin.role,
      firmId: admin.firmId,
    });
  });

  it('requires bearer authentication for GET /me', async () => {
    const response = await request(testApp()).get('/api/v1/me');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHORIZED');
  });

  it('continues enforcing route-specific roles after adding GET /me', async () => {
    const response = await request(testApp())
      .get('/api/v1/admin/ping')
      .set('Authorization', 'Bearer viewer-token');

    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'FORBIDDEN');
  });

  it('continues enforcing the authenticated firm on firm-scoped routes', async () => {
    const ownFirm = await request(testApp())
      .get(`/api/v1/firms/${admin.firmId}/ping`)
      .set('Authorization', 'Bearer admin-token');
    const otherFirm = await request(testApp())
      .get('/api/v1/firms/33333333-3333-4333-8333-333333333333/ping')
      .set('Authorization', 'Bearer admin-token');

    assert.equal(ownFirm.status, 200);
    assert.equal(otherFirm.status, 403);
    assert.equal(otherFirm.body.code, 'FORBIDDEN');
  });
});
