import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { AppError, errorHandler, unauthorized } from '../../src/errors.js';
import { PortfolioMarkRepository } from '../../src/portfolio/portfolio-mark-repository.js';
import { PortfolioMarkService } from '../../src/portfolio/portfolio-mark-service.js';
import { createPortfolioMarkRouter } from '../../src/routes/portfolio-mark-routes.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const markId = '44444444-4444-4444-8444-444444444444';

const input = Object.freeze({
  markText: ' Forge Global ',
  jurisdiction: 'us',
  sourceRegistry: 'uspto',
  registryReference: ' 12345678 ',
  niceClasses: [42, 9, 42],
  status: 'Registered',
  filingDate: '2020-01-02',
  registrationDate: null,
  renewalDate: null,
});

const record = Object.freeze({
  id: markId,
  firmId,
  ownerUserId: userId,
  markText: 'Forge Global',
  jurisdiction: 'US',
  sourceRegistry: 'USPTO',
  registryReference: '12345678',
  niceClasses: [9, 42],
  status: 'registered',
  filingDate: '2020-01-02',
  registrationDate: null,
  renewalDate: null,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
});

function repository(overrides = {}) {
  return {
    calls: [],
    async create(payload) { this.calls.push(['create', payload]); return record; },
    async list(payload) { this.calls.push(['list', payload]); return { items: [record], total: 1 }; },
    async get(payload) { this.calls.push(['get', payload]); return record; },
    async update(payload) { this.calls.push(['update', payload]); return { ...record, ...payload.input }; },
    async delete(payload) { this.calls.push(['delete', payload]); return true; },
    ...overrides,
  };
}

function serviceFor(overrides) {
  return new PortfolioMarkService({ repository: repository(overrides) });
}

function routeApp(portfolioMarkService, events = []) {
  const identities = {
    'admin-token': { userId, role: 'admin', firmId },
    'attorney-token': { userId, role: 'attorney', firmId },
    'viewer-token': { userId, role: 'viewer', firmId },
  };
  const authenticate = (req, _res, next) => {
    events.push('authenticate');
    const identity = identities[req.get('authorization')?.replace('Bearer ', '')];
    if (!identity) return next(unauthorized());
    req.auth = identity;
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createPortfolioMarkRouter(authenticate, portfolioMarkService));
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found.' }));
  app.use(errorHandler);
  return app;
}

describe('portfolio mark service', () => {
  it('creates, lists, gets, updates, and deletes with the authenticated firm scope', async () => {
    const repo = repository();
    const service = new PortfolioMarkService({ repository: repo });
    assert.deepEqual(await service.createPortfolioMark({ firmId, actorUserId: userId, input }), record);
    assert.deepEqual(await service.listPortfolioMarks({ firmId, filters: {}, pagination: {} }), {
      items: [record], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    assert.deepEqual(await service.getPortfolioMark({ firmId, portfolioMarkId: markId }), record);
    assert.equal((await service.updatePortfolioMark({ firmId, portfolioMarkId: markId, input: { renewalDate: null } })).renewalDate, null);
    await service.deletePortfolioMark({ firmId, portfolioMarkId: markId });
    assert.equal(repo.calls.every(([, payload]) => payload.firmId === firmId), true);
    assert.deepEqual(repo.calls[0][1].input, {
      markText: 'Forge Global', jurisdiction: 'US', sourceRegistry: 'USPTO', registryReference: '12345678',
      niceClasses: [9, 42], status: 'registered', filingDate: '2020-01-02', registrationDate: null, renewalDate: null,
    });
    assert.deepEqual(input, {
      markText: ' Forge Global ', jurisdiction: 'us', sourceRegistry: 'uspto', registryReference: ' 12345678 ',
      niceClasses: [42, 9, 42], status: 'Registered', filingDate: '2020-01-02', registrationDate: null, renewalDate: null,
    });
  });

  it('normalizes cross-firm missing get, update, and delete records to the same 404', async () => {
    const service = serviceFor({
      async get() { return null; }, async update() { return null; }, async delete() { return false; },
    });
    for (const operation of [
      () => service.getPortfolioMark({ firmId: otherFirmId, portfolioMarkId: markId }),
      () => service.updatePortfolioMark({ firmId: otherFirmId, portfolioMarkId: markId, input: { status: 'filed' } }),
      () => service.deletePortfolioMark({ firmId: otherFirmId, portfolioMarkId: markId }),
    ]) {
      await assert.rejects(operation, { status: 404, code: 'PORTFOLIO_MARK_NOT_FOUND' });
    }
  });

  it('rejects invalid IDs, body fields, enum, calendar-date, class, empty-patch, and filter inputs', async () => {
    const service = serviceFor();
    const invalidOperations = [
      () => service.getPortfolioMark({ firmId, portfolioMarkId: 'not-a-uuid' }),
      () => service.createPortfolioMark({ firmId, actorUserId: userId, input: { ...input, status: 'live' } }),
      () => service.createPortfolioMark({ firmId, actorUserId: userId, input: { ...input, filingDate: '2026-02-30' } }),
      () => service.createPortfolioMark({ firmId, actorUserId: userId, input: { ...input, niceClasses: [46] } }),
      () => service.createPortfolioMark({ firmId, actorUserId: userId, input: { ...input, firm_id: otherFirmId } }),
      () => service.updatePortfolioMark({ firmId, portfolioMarkId: markId, input: {} }),
      () => service.updatePortfolioMark({ firmId, portfolioMarkId: markId, input: { id: markId } }),
      () => service.listPortfolioMarks({ firmId, filters: { role: 'admin' }, pagination: {} }),
      () => service.listPortfolioMarks({ firmId, filters: { niceClass: '46' }, pagination: {} }),
      () => service.listPortfolioMarks({ firmId, filters: { renewalAfter: '2026-03-01', renewalBefore: '2026-02-01' }, pagination: {} }),
      () => service.listPortfolioMarks({ firmId, filters: {}, pagination: { page: '0' } }),
      () => service.listPortfolioMarks({ firmId, filters: {}, pagination: { pageSize: '101' } }),
    ];
    for (const operation of invalidOperations) await assert.rejects(operation, { code: 'VALIDATION_ERROR' });
  });

  it('normalizes the documented uniqueness conflict while preserving internal database failures', async () => {
    const conflictService = serviceFor({
      async create() { throw { code: '23505', constraint: 'portfolio_marks_firm_registry_reference_key' }; },
    });
    await assert.rejects(
      () => conflictService.createPortfolioMark({ firmId, actorUserId: userId, input }),
      { status: 409, code: 'PORTFOLIO_MARK_CONFLICT' },
    );
    const failureService = serviceFor({ async get() { throw new Error('database password must not leak'); } });
    await assert.rejects(() => failureService.getPortfolioMark({ firmId, portfolioMarkId: markId }), /database password/);
  });
});

describe('portfolio mark repository', () => {
  it('uses parameterized tenant-scoped SQL and deterministic bounded list ordering', async () => {
    const calls = [];
    const row = {
      id: markId, firm_id: firmId, owner_user_id: userId, mark_text: 'Forge Global', jurisdiction: 'US',
      source_registry: 'USPTO', registry_reference: '12345678', nice_classes: [9, 42], status: 'registered',
      filing_date: '2020-01-02', registration_date: null, renewal_date: null,
      created_at: new Date('2026-08-21T00:00:00Z'), updated_at: new Date('2026-08-21T00:00:00Z'),
    };
    const client = { async query(sql, values = []) { calls.push([sql, values]); if (sql.startsWith('DELETE')) return { rowCount: 1, rows: [{ id: markId }] }; return { rowCount: 0, rows: [] }; }, release() {} };
    const database = {
      async query(sql, values) {
        calls.push([sql, values]);
        if (sql.includes('count(*)')) return { rowCount: 1, rows: [{ total: 1 }] };
        return { rowCount: 1, rows: [row] };
      },
      async connect() { return client; },
    };
    const repo = new PortfolioMarkRepository(database);
    await repo.create({ firmId, actorUserId: userId, input: {
      markText: 'Forge Global', jurisdiction: 'US', sourceRegistry: 'USPTO', registryReference: '12345678',
      niceClasses: [9, 42], status: 'registered', filingDate: null, registrationDate: null, renewalDate: null,
    } });
    const listed = await repo.list({ firmId, filters: {
      status: 'registered', jurisdiction: null, sourceRegistry: null, registryReference: null,
      niceClass: null, renewalBefore: null, renewalAfter: null,
    }, pagination: { page: 2, pageSize: 10 } });
    await repo.get({ firmId, portfolioMarkId: markId });
    await repo.update({ firmId, portfolioMarkId: markId, input: { status: 'filed' } });
    await repo.delete({ firmId, portfolioMarkId: markId });
    assert.deepEqual(listed.items[0].niceClasses, [9, 42]);
    const sql = calls.map(([statement]) => statement).join('\n');
    assert.match(sql, /WHERE firm_id = \$1 AND id = \$2/);
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    assert.match(sql, /LIMIT \$3 OFFSET \$4/);
    assert.match(sql, /DELETE FROM portfolio_marks WHERE firm_id = \$1 AND id = \$2/);
    assert.equal(sql.includes('Forge Global'), false);
    assert.equal(calls.every(([, values]) => Array.isArray(values)), true);
  });
});

describe('portfolio mark routes', () => {
  it('enforces authentication, role permissions, validation-before-service, and firm claims', async () => {
    const calls = [];
    const service = {
      async createPortfolioMark(payload) { calls.push(['create', payload]); return record; },
      async listPortfolioMarks(payload) { calls.push(['list', payload]); return { items: [record], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } }; },
      async getPortfolioMark(payload) { calls.push(['get', payload]); return record; },
      async updatePortfolioMark(payload) { calls.push(['update', payload]); return record; },
      async deletePortfolioMark(payload) { calls.push(['delete', payload]); },
    };
    const events = [];
    const app = routeApp(service, events);
    assert.equal((await request(app).get('/api/v1/portfolio-marks')).status, 401);
    for (const token of ['admin-token', 'attorney-token']) {
      assert.equal((await request(app).post('/api/v1/portfolio-marks').set('Authorization', `Bearer ${token}`).send(input)).status, 201);
    }
    assert.equal((await request(app).get('/api/v1/portfolio-marks').set('Authorization', 'Bearer viewer-token')).status, 200);
    assert.equal((await request(app).get(`/api/v1/portfolio-marks/${markId}`).set('Authorization', 'Bearer viewer-token')).status, 200);
    const denied = await request(app).patch(`/api/v1/portfolio-marks/${markId}`).set('Authorization', 'Bearer viewer-token').send({ status: 'filed' });
    assert.equal(denied.status, 403);
    const createsBeforeInvalid = calls.filter(([name]) => name === 'create').length;
    const invalid = await request(app).post('/api/v1/portfolio-marks').set('Authorization', 'Bearer admin-token').send({ ...input, firm_id: otherFirmId });
    assert.equal(invalid.status, 400);
    assert.equal(calls.filter(([name]) => name === 'create').length, createsBeforeInvalid);
    assert.equal(calls[0][1].firmId, firmId);
    assert.equal(calls[0][1].actorUserId, userId);
    assert.deepEqual(events.slice(0, 2), ['authenticate', 'authenticate']);
  });

  it('is mounted before the application fallback and normalizes cross-firm and database errors', async () => {
    const service = {
      async createPortfolioMark() { throw new Error('SQL host password'); },
      async listPortfolioMarks() { return { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }; },
      async getPortfolioMark() { throw new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.'); },
      async updatePortfolioMark() { throw new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.'); },
      async deletePortfolioMark() { throw new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.'); },
    };
    const app = routeApp(service);
    const list = await request(app).get('/api/v1/portfolio-marks').set('Authorization', 'Bearer admin-token');
    assert.equal(list.status, 200);
    const databaseError = await request(app).post('/api/v1/portfolio-marks').set('Authorization', 'Bearer admin-token').send(input);
    assert.deepEqual(databaseError.body, { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' });
    assert.equal(JSON.stringify(databaseError.body).includes('password'), false);
    const notFound = await request(app).get(`/api/v1/portfolio-marks/${markId}`).set('Authorization', 'Bearer admin-token');
    assert.equal(notFound.status, 404);
    const fallback = await request(app).get('/api/v1/not-a-route').set('Authorization', 'Bearer admin-token');
    assert.equal(fallback.status, 404);
  });
});
