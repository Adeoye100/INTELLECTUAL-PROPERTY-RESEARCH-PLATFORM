import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { errorHandler, unauthorized } from '../../src/errors.js';
import { createProvisioningRouter } from '../../src/routes/provisioning-routes.js';

describe('firm provisioning route', () => {
  it('requires a bearer-authenticated identity and delegates only firmName plus that identity', async () => {
    const identity = {
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'admin@example.test',
      supabaseRole: 'authenticated',
    };
    let call;
    const authenticateIdentity = (req, _res, next) => {
      if (req.get('authorization') !== 'Bearer verified-token') return next(unauthorized());
      req.auth = identity;
      return next();
    };
    const app = express();
    app.use(express.json());
    app.use('/api/v1/provisioning', createProvisioningRouter(authenticateIdentity, {
      async provisionFirm(auth, body) {
        call = { auth, body };
        return {
          user: { id: 'local-user', firmId: 'firm-1', email: auth.email, role: 'admin' },
          firm: { id: 'firm-1', name: body.firmName, subscriptionTier: 'free' },
        };
      },
    }));
    app.use(errorHandler);

    const missing = await request(app).post('/api/v1/provisioning/firm').send({ firmName: 'Forge' });
    assert.equal(missing.status, 401);

    const response = await request(app)
      .post('/api/v1/provisioning/firm')
      .set('Authorization', 'Bearer verified-token')
      .send({ firmName: 'Forge Legal' });
    assert.equal(response.status, 201);
    assert.deepEqual(call, { auth: identity, body: { firmName: 'Forge Legal' } });
    assert.equal(response.body.user.role, 'admin');
  });
});
