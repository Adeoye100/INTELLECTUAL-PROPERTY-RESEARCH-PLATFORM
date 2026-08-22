import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createHealthRouter } from '../../src/routes/health-routes.js';
import express from 'express';

describe('health and readiness routes', () => {
  it('exposes process health without dependency detail', async () => {
    const app = express();
    app.use(createHealthRouter());
    const response = await request(app).get('/healthz');
    assert.deepEqual(response.body, { status: 'ok' });
  });

  it('reports readiness only when every injected dependency check succeeds', async () => {
    const ready = express();
    ready.use(createHealthRouter({ readinessChecks: [async () => {}, async () => {}] }));
    assert.deepEqual((await request(ready).get('/readyz')).body, { status: 'ready' });

    const unavailable = express();
    unavailable.use(createHealthRouter({ readinessChecks: [async () => { throw new Error('redis secret detail'); }] }));
    const response = await request(unavailable).get('/readyz');
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { code: 'NOT_READY', message: 'Service is not ready.' });
    assert.equal(JSON.stringify(response.body).includes('redis'), false);
  });
});
