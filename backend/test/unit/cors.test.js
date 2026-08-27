import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createCorsMiddleware } from '../../src/cors.js';

function testApp() {
  const app = express();
  app.use(createCorsMiddleware());
  app.get('/protected', (_request, response) => response.status(401).json({ code: 'UNAUTHORIZED' }));
  return app;
}

function configuredTestApp(origins) {
  const app = express();
  app.use(createCorsMiddleware({ allowedOrigins: origins }));
  app.get('/protected', (_request, response) => response.status(401).json({ code: 'UNAUTHORIZED' }));
  return app;
}

describe('CORS middleware', () => {
  it('allows the local Vite origin and completes Authorization/Content-Type preflight requests', async () => {
    const response = await request(testApp())
      .options('/protected')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization, content-type');

    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.match(response.headers['access-control-allow-methods'], /OPTIONS/);
    assert.match(response.headers['access-control-allow-headers'], /Authorization/);
    assert.match(response.headers['access-control-allow-headers'], /Content-Type/);
    assert.match(response.headers.vary, /Origin/);
  });

  it('does not grant CORS access to origins outside the allow-list', async () => {
    const response = await request(testApp())
      .options('/protected')
      .set('Origin', 'http://localhost:4173')
      .set('Access-Control-Request-Method', 'GET');

    assert.equal(response.status, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.equal(response.body.code, 'CORS_ORIGIN_DENIED');
  });

  it('keeps CORS headers on allowed-origin authentication errors', async () => {
    const response = await request(testApp())
      .get('/protected')
      .set('Origin', 'http://localhost:5173');

    assert.equal(response.status, 401);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  it('uses an exact configured origin allow-list and never reflects an unapproved origin', async () => {
    const app = configuredTestApp(['https://app.iprp.test']);
    const allowed = await request(app).get('/protected').set('Origin', 'https://app.iprp.test');
    const denied = await request(app).options('/protected')
      .set('Origin', 'https://attacker.example.test')
      .set('Access-Control-Request-Method', 'GET');
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.iprp.test');
    assert.equal(denied.status, 403);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  });
});
