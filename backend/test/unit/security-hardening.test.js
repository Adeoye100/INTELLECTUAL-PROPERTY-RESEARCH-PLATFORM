import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { errorHandler, unauthorized } from '../../src/errors.js';
import { sanitizeAuditData, AUDIT_REDACTION } from '../../src/audit/audit-sanitizer.js';
import { parseAuditLogListQuery } from '../../src/audit/audit-service.js';
import { parseExportCreate } from '../../src/exports/export-validation.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const markId = '33333333-3333-4333-8333-333333333333';

function appWithRejectedAuthentication(calls) {
  const authenticate = (_request, _response, next) => {
    calls.authentication += 1;
    next(unauthorized());
  };
  return createApp({
    authService: {}, authenticate, authenticateIdentity: authenticate, provisioningService: {},
    portfolioMarkService: {
      async createPortfolioMark() { calls.service += 1; return {}; },
      async listPortfolioMarks() { calls.service += 1; return {}; },
      async getPortfolioMark() { calls.service += 1; return {}; },
      async updatePortfolioMark() { calls.service += 1; return {}; },
      async deletePortfolioMark() { calls.service += 1; },
    },
  });
}

describe('BE-21 HTTP, parser, and safe-error hardening', () => {
  it('sets API security headers and rejects oversized request targets and JSON before route work', async () => {
    const calls = { authentication: 0, service: 0 };
    const app = appWithRejectedAuthentication(calls);
    const normal = await request(app).get('/api/v1/portfolio-marks');
    assert.equal(normal.status, 401);
    assert.equal(normal.headers['x-content-type-options'], 'nosniff');
    assert.equal(normal.headers['x-frame-options'], 'DENY');
    assert.equal(normal.headers['referrer-policy'], 'no-referrer');
    assert.equal(normal.headers['permissions-policy'], 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
    assert.match(normal.headers['strict-transport-security'], /max-age=31536000/);
    assert.match(normal.headers['content-security-policy'], /default-src 'none'/);

    const target = await request(app).get(`/api/v1/portfolio-marks?mark=${'a'.repeat(4_096)}`);
    assert.equal(target.status, 414);
    assert.equal(target.body.code, 'REQUEST_TARGET_TOO_LARGE');
    const oversized = await request(app).post('/api/v1/auth/invitations/test/accept')
      .send({ fullName: 'A'.repeat(17 * 1024) });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.code, 'REQUEST_BODY_TOO_LARGE');
    assert.equal(calls.service, 0);

    const multipart = await request(app).post('/api/v1/portfolio-marks')
      .set('Content-Type', 'multipart/form-data; boundary=ignored')
      .send('--ignored--');
    assert.equal(multipart.status, 415);
    assert.equal(multipart.body.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('runs authentication before RBAC-protected mutation validation or services', async () => {
    const calls = { authentication: 0, service: 0 };
    const response = await request(appWithRejectedAuthentication(calls))
      .patch(`/api/v1/portfolio-marks/${markId}`)
      .send({ firmId, status: 'filed' });
    assert.equal(response.status, 401);
    assert.equal(calls.authentication, 1);
    assert.equal(calls.service, 0);
  });

  it('keeps malformed internal errors and prototype-shaped inputs out of API/audit data', async () => {
    const app = express();
    app.get('/failure', () => { throw new Error('database password=not-for-response'); });
    app.use(errorHandler);
    const response = await request(app).get('/failure');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' });

    const sanitized = sanitizeAuditData({ nested: { SessionCookieValue: 'redact-me', API_TOKEN_HINT: 'redact-me' } });
    assert.equal(sanitized.nested.SessionCookieValue, AUDIT_REDACTION);
    assert.equal(sanitized.nested.API_TOKEN_HINT, AUDIT_REDACTION);
    assert.throws(() => parseExportCreate(JSON.parse('{"type":"search_results","sourceEntityId":"11111111-1111-4111-8111-111111111111","parameters":{},"idempotencyKey":"safe","__proto__":{"polluted":true}}')));
    assert.throws(() => parseAuditLogListQuery({ cursor: 'a'.repeat(513) }), { code: 'AUDIT_PAYLOAD_INVALID' });
  });
});
