import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createBillingRouter } from '../../src/routes/billing-routes.js';
import { errorHandler } from '../../src/errors.js';

const authenticate = (req, _res, next) => {
  const role = req.get('x-test-role');
  req.auth = { userId: '22222222-2222-4222-8222-222222222222', firmId: '11111111-1111-4111-8111-111111111111', role };
  next();
};

describe('billing route authorization', () => {
  it('denies non-admin roles before invoking tenant billing services', async () => {
    let calls = 0;
    const app = express(); app.use(express.json());
    app.use('/api/v1', createBillingRouter(authenticate, {
      async summary() { calls += 1; return {}; }, async webhook() {},
    })); app.use(errorHandler);
    for (const role of ['viewer', 'attorney']) {
      const response = await request(app).get('/api/v1/billing').set('x-test-role', role);
      assert.equal(response.status, 403);
    }
    assert.equal(calls, 0);
  });

  it('allows an admin to read only the service-projected summary', async () => {
    const app = express(); app.use(express.json());
    app.use('/api/v1', createBillingRouter(authenticate, {
      async summary(auth) { return { firmId: auth.firmId }; }, async webhook() {},
    })); app.use(errorHandler);
    const response = await request(app).get('/api/v1/billing').set('x-test-role', 'admin');
    assert.equal(response.status, 200);
    assert.equal(response.body.firmId, '11111111-1111-4111-8111-111111111111');
  });
});
