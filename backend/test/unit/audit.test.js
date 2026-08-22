import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { errorHandler, unauthorized } from '../../src/errors.js';
import { AuditLogRepository } from '../../src/audit/audit-log-repository.js';
import { AuditService, parseAuditLogListQuery } from '../../src/audit/audit-service.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../src/audit/audit-taxonomy.js';
import { sanitizeAuditData } from '../../src/audit/audit-sanitizer.js';
import { captureAuditRequestContext } from '../../src/audit/request-context.js';
import { ExportAuditService } from '../../src/audit/export-audit-service.js';
import { PortfolioMarkService } from '../../src/portfolio/portfolio-mark-service.js';
import { WatchService } from '../../src/watch/watch-service.js';
import { AlertService } from '../../src/alerts/alert-service.js';
import { UserRoleService } from '../../src/users/user-role-service.js';
import { createAuditLogRouter } from '../../src/routes/audit-log-routes.js';
import { createUserRouter } from '../../src/routes/user-routes.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333'; // Supabase subject
const localActorId = '44444444-4444-4444-8444-444444444444';
const entityId = '55555555-5555-4555-8555-555555555555';
const secondUserId = '66666666-6666-4666-8666-666666666666';
const thirdUserId = '77777777-7777-4777-8777-777777777777';
const now = new Date('2026-08-22T12:00:00.000Z');

function auditRepository({ fail = false } = {}) {
  const records = [];
  return {
    records,
    async insert(payload) {
      if (fail) throw new Error('database password must not escape');
      const record = {
        id: payload.id,
        firmId: payload.firmId,
        actorUserId: localActorId,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        beforeState: payload.beforeState,
        afterState: payload.afterState,
        metadata: payload.metadata,
        requestId: payload.requestContext.requestId,
        ipAddress: payload.requestContext.ipAddress,
        userAgent: payload.requestContext.userAgent,
        occurredAt: payload.occurredAt,
        createdAt: payload.occurredAt,
      };
      records.push(record);
      return record;
    },
    async list() { return records; },
    async findById({ auditLogId }) { return records.find((record) => record.id === auditLogId) ?? null; },
  };
}

function createAuditService(options = {}) {
  return new AuditService({
    repository: options.repository ?? auditRepository(options),
    clock: () => now,
    idGenerator: () => '88888888-8888-4888-8888-888888888888',
  });
}

function recordInput(overrides = {}) {
  return {
    firmId,
    actorUserId,
    action: AUDIT_ACTIONS.PORTFOLIO_MARK_CREATED,
    entityType: AUDIT_ENTITY_TYPES.PORTFOLIO_MARK,
    entityId,
    afterState: { id: entityId, registryReference: '12345678' },
    metadata: { changedFields: ['status'] },
    requestContext: { requestId: 'request-1', ipAddress: '203.0.113.10', userAgent: 'unit-test' },
    ...overrides,
  };
}

describe('BE-16 schema and sanitizer', () => {
  it('defines an idempotent append-only audit table with required constraints and indexes', async () => {
    const source = await readFile(new URL('../../migrations/009_create_audit_logs.sql', import.meta.url), 'utf8');
    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS audit_logs', 'firm_id uuid NOT NULL REFERENCES firms(id)',
      'actor_user_id uuid NOT NULL REFERENCES users(id)', 'before_state jsonb', 'after_state jsonb',
      "metadata jsonb NOT NULL DEFAULT '{}'::jsonb", 'audit_logs_action_valid',
      'audit_logs_entity_type_valid', 'audit_logs_metadata_object', 'audit_logs_has_auditable_data',
      'audit_logs_firm_occurred_id_idx', 'audit_logs_actor_occurred_idx',
      'audit_logs_entity_occurred_idx', 'audit_logs_action_occurred_idx',
      'audit_logs_request_id_idx', 'CREATE TRIGGER audit_logs_reject_mutation',
      'BEFORE UPDATE OR DELETE ON audit_logs', 'audit_logs is append-only',
    ]) assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('recursively redacts secrets, strips pollution keys, and preserves caller input', () => {
    const input = JSON.parse('{"passwordHash":"p","nested":{"AccessToken":"a","safe":1,"__proto__":{"polluted":true}},"items":[{"COOKIE":"c"}]}');
    const before = structuredClone(input);
    const sanitized = sanitizeAuditData(input);
    assert.deepEqual(sanitized, {
      items: [{ COOKIE: '[REDACTED]' }],
      nested: { AccessToken: '[REDACTED]', safe: 1 },
      passwordHash: '[REDACTED]',
    });
    assert.deepEqual(input, before);
    assert.equal({}.polluted, undefined);
  });

  it('rejects circular, unsupported, non-finite, deep, oversized, and overlong audit payloads', () => {
    const circular = {}; circular.self = circular;
    for (const value of [circular, { fn() {} }, { symbol: Symbol('x') }, { number: Infinity }]) {
      assert.throws(() => sanitizeAuditData(value), { code: 'AUDIT_PAYLOAD_INVALID' });
    }
    assert.throws(() => sanitizeAuditData({ a: { b: { c: true } } }, { maxDepth: 1 }), { code: 'AUDIT_PAYLOAD_INVALID' });
    assert.throws(() => sanitizeAuditData([1, 2], { maxArrayLength: 1 }), { code: 'AUDIT_PAYLOAD_INVALID' });
    assert.throws(() => sanitizeAuditData({ text: 'x'.repeat(100) }, { maxSerializedBytes: 20 }), { code: 'AUDIT_PAYLOAD_TOO_LARGE' });
  });
});

describe('audit service and export hook', () => {
  it('records sanitized immutable audit data using the caller-owned transaction', async () => {
    const repository = auditRepository();
    const service = createAuditService({ repository });
    const transaction = { async query() {} };
    const record = await service.record(recordInput({
      transaction,
      afterState: { id: entityId, password: 'never-store-this', registryReference: '12345678' },
    }));
    assert.equal(repository.records.length, 1);
    assert.equal(record.afterState.password, '[REDACTED]');
    assert.equal(repository.records[0].afterState.registryReference, '12345678');
    assert.equal(Object.hasOwn(AuditLogRepository.prototype, 'update'), false);
    assert.equal(Object.hasOwn(AuditLogRepository.prototype, 'delete'), false);
  });

  it('uses stable validation and write error codes while allowing direct server-side recording', async () => {
    const service = createAuditService();
    await assert.rejects(() => service.record(recordInput({ action: 'unknown.action' })), { code: 'AUDIT_ACTION_INVALID' });
    await assert.rejects(() => service.record(recordInput({ entityType: 'unknown' })), { code: 'AUDIT_ENTITY_TYPE_INVALID' });
    await assert.rejects(() => service.record(recordInput({ entityId: 'bad' })), { code: 'AUDIT_ENTITY_ID_INVALID' });
    await assert.rejects(() => service.record(recordInput({ actorUserId: 'bad' })), { code: 'AUDIT_ACTOR_INVALID' });
    await assert.rejects(() => service.record(recordInput({ firmId: 'bad' })), { code: 'AUDIT_FIRM_INVALID' });
    await assert.rejects(() => service.record(recordInput({ transaction: {} })), { code: 'AUDIT_TRANSACTION_REQUIRED' });
    await assert.rejects(() => createAuditService({ fail: true }).record(recordInput()), { code: 'AUDIT_WRITE_FAILED' });
    assert.equal((await service.record(recordInput())).id, '88888888-8888-4888-8888-888888888888');
  });

  it('parses bounded, deterministic audit-list pagination and filters', () => {
    const cursor = Buffer.from(JSON.stringify({ occurredAt: now.toISOString(), id: entityId })).toString('base64url');
    assert.deepEqual(parseAuditLogListQuery({ action: AUDIT_ACTIONS.WATCH_CREATED, entityType: 'watch', pageSize: '2', cursor }), {
      filters: { actorUserId: null, action: AUDIT_ACTIONS.WATCH_CREATED, entityType: 'watch', entityId: null, occurredFrom: null, occurredTo: null },
      pagination: { cursor: { occurredAt: now.toISOString(), id: entityId }, pageSize: 2 },
    });
    for (const query of [{ action: 'bad.action' }, { entityId: 'bad' }, { cursor: 'bad' }, { pageSize: '101' }]) {
      assert.throws(() => parseAuditLogListQuery(query));
    }
  });

  it('uses firm-scoped deterministic audit-list SQL and opaque next cursors', async () => {
    const calls = [];
    const first = {
      id: entityId, firm_id: firmId, actor_user_id: localActorId, action: AUDIT_ACTIONS.WATCH_CREATED,
      entity_type: 'watch', entity_id: thirdUserId, before_state: null, after_state: { id: thirdUserId },
      metadata: { changedFields: ['state'] }, request_id: null, ip_address: null, user_agent: null,
      occurred_at: now, created_at: now,
    };
    const second = { ...first, id: secondUserId, occurred_at: new Date('2026-08-22T11:00:00.000Z') };
    const repository = new AuditLogRepository({
      async query(sql, values) { calls.push([sql, values]); return { rowCount: 2, rows: [first, second] }; },
    });
    const rows = await repository.list({
      firmId,
      filters: { actorUserId: localActorId, action: AUDIT_ACTIONS.WATCH_CREATED, entityType: 'watch', entityId: thirdUserId, occurredFrom: null, occurredTo: null },
      pagination: { pageSize: 1, cursor: null },
    });
    const service = createAuditService({ repository: { async insert() {}, async list() { return rows; }, async findById() { return null; } } });
    const page = await service.list({ firmId, filters: {}, pagination: { pageSize: 1, cursor: null } });
    assert.equal(page.auditLogs.length, 1);
    assert.equal(typeof page.nextCursor, 'string');
    const sql = calls[0][0];
    assert.match(sql, /WHERE firm_id = \$1/);
    assert.match(sql, /ORDER BY occurred_at DESC, id DESC/);
    assert.match(sql, /LIMIT \$6/);
    assert.equal(sql.includes(firmId), false);
  });

  it('provides server-internal export lifecycle helpers without retaining files, URLs, or secrets', async () => {
    const repository = auditRepository();
    const exports = new ExportAuditService({ auditService: createAuditService({ repository }) });
    for (const operation of ['requested', 'completed', 'failed']) {
      await exports[operation]({
        firmId, actorUserId, exportId: entityId, exportType: 'portfolio', outputFormat: 'pdf',
        filterSummary: { status: 'registered', signedUrl: 'https://secret', fileContents: 'large', accessToken: 'x' },
        ...(operation === 'failed' ? { errorCode: 'EXPORT_RENDER_FAILED' } : {}),
      });
    }
    assert.deepEqual(repository.records.map((record) => record.action), [
      AUDIT_ACTIONS.EXPORT_REQUESTED, AUDIT_ACTIONS.EXPORT_COMPLETED, AUDIT_ACTIONS.EXPORT_FAILED,
    ]);
    assert.deepEqual(repository.records[0].metadata.filterSummary, { status: 'registered' });
    assert.equal(JSON.stringify(repository.records).includes('https://secret'), false);
    assert.equal(JSON.stringify(repository.records).includes('large'), false);
  });
});

function transactionalState(record) {
  const state = { record: structuredClone(record), auditCalls: [], rolledBack: 0, committed: 0 };
  const transaction = { async query() {} };
  const withTransaction = async (work) => {
    const previous = structuredClone(state.record);
    try {
      const result = await work(transaction);
      state.committed += 1;
      return result;
    } catch (error) {
      state.record = previous;
      state.rolledBack += 1;
      throw error;
    }
  };
  return { state, transaction, withTransaction };
}

function transactionAudit({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async record(payload) {
      calls.push(payload);
      if (fail) throw new Error('audit insert failed');
      return { id: entityId };
    },
  };
}

describe('transactional sensitive mutations', () => {
  it('audits portfolio create/update/delete snapshots and rolls back mutation on audit failure', async () => {
    const mark = { id: entityId, firmId, markText: 'FORGE', jurisdiction: 'US', sourceRegistry: 'USPTO', registryReference: '123', niceClasses: [9], status: 'filed', filingDate: null, registrationDate: null, renewalDate: null };
    const transaction = transactionalState(mark);
    const audit = transactionAudit();
    const repository = {
      withTransaction: transaction.withTransaction,
      async create() { return structuredClone(transaction.state.record); }, async list() { return { items: [], total: 0 }; },
      async get() { return structuredClone(transaction.state.record); },
      async update({ input }) { Object.assign(transaction.state.record, input); return structuredClone(transaction.state.record); },
      async delete() { transaction.state.record = null; return true; },
    };
    const service = new PortfolioMarkService({ repository, auditService: audit });
    await service.updatePortfolioMark({ firmId, actorUserId, portfolioMarkId: entityId, input: { status: 'registered' } });
    assert.equal(audit.calls[0].action, AUDIT_ACTIONS.PORTFOLIO_MARK_UPDATED);
    assert.equal(audit.calls[0].beforeState.status, 'filed');
    assert.equal(audit.calls[0].afterState.status, 'registered');
    const failing = new PortfolioMarkService({ repository, auditService: transactionAudit({ fail: true }) });
    await assert.rejects(() => failing.updatePortfolioMark({ firmId, actorUserId, portfolioMarkId: entityId, input: { status: 'abandoned' } }));
    assert.equal(transaction.state.record.status, 'registered');
    assert.equal(transaction.state.rolledBack, 1);
  });

  it('uses watch state-transition taxonomy, alert status taxonomy, and no audit on missing records', async () => {
    const watch = { id: entityId, firmId, portfolioMarkId: thirdUserId, state: 'enabled', pollIntervalMinutes: 60, nextPollAt: null, lastPolledAt: null, lastPollStatus: null, lastErrorCode: null };
    const watchTx = transactionalState(watch); const watchAudit = transactionAudit();
    const watchRepository = {
      withTransaction: watchTx.withTransaction, async portfolioMarkExists() { return true; }, async list() { return { items: [], total: 0 }; },
      async get() { return structuredClone(watchTx.state.record); }, async create() { return structuredClone(watchTx.state.record); },
      async update({ input }) { Object.assign(watchTx.state.record, input); return structuredClone(watchTx.state.record); }, async delete() { return true; },
    };
    const watchService = new WatchService({ repository: watchRepository, auditService: watchAudit, defaultPollIntervalMinutes: 60, clock: () => now });
    await watchService.updateWatch({ firmId, actorUserId, watchId: entityId, input: { state: 'paused' } });
    assert.equal(watchAudit.calls[0].action, AUDIT_ACTIONS.WATCH_DISABLED);
    const alert = { id: entityId, firmId, watchId: thirdUserId, portfolioMarkId: secondUserId, riskScoreId: localActorId, severity: 'high', status: 'unread', policyVersion: 'v1', readAt: null, dismissedAt: null };
    const alertTx = transactionalState(alert); const alertAudit = transactionAudit();
    const alertRepository = {
      withTransaction: alertTx.withTransaction, async list() { return { items: [], total: 0 }; },
      async get() { return structuredClone(alertTx.state.record); },
      async transition({ action }) { alertTx.state.record.status = action === 'read' ? 'read' : 'dismissed'; return true; },
    };
    const alertService = new AlertService({ repository: alertRepository, auditService: alertAudit, clock: () => now });
    await alertService.transitionAlert({ firmId, actorUserId, alertId: entityId, input: { action: 'read' } });
    assert.equal(alertAudit.calls[0].action, AUDIT_ACTIONS.ALERT_READ);
    const missingAudit = transactionAudit();
    const missing = new AlertService({ repository: { ...alertRepository, async get() { return null; } }, auditService: missingAudit, clock: () => now });
    await assert.rejects(() => missing.transitionAlert({ firmId: otherFirmId, actorUserId, alertId: entityId, input: { action: 'dismiss' } }), { code: 'ALERT_NOT_FOUND' });
    assert.equal(missingAudit.calls.length, 0);
  });
});

function roleRepository(users) {
  const state = { users: structuredClone(users), rolledBack: 0 };
  return {
    state,
    async withTransaction(work) {
      const previous = structuredClone(state.users);
      try { return await work({ async query() {} }); } catch (error) { state.users = previous; state.rolledBack += 1; throw error; }
    },
    async findRoleTargetForUpdate({ firmId: scope, userId }) {
      const user = state.users.find((item) => item.firmId === scope && item.id === userId);
      return user ? structuredClone(user) : null;
    },
    async listActiveAdminsForUpdate({ firmId: scope }) { return state.users.filter((item) => item.firmId === scope && item.role === 'admin').map((item) => item.id); },
    async updateRole({ firmId: scope, userId, role }) {
      const user = state.users.find((item) => item.firmId === scope && item.id === userId);
      if (!user) return null; user.role = role; return structuredClone(user);
    },
  };
}

describe('role change and read route boundaries', () => {
  it('updates users.role transactionally, hides cross-firm targets, and protects the last Admin', async () => {
    const repository = roleRepository([
      { id: localActorId, firmId, role: 'admin', supabaseUserId: actorUserId, active: true },
      { id: entityId, firmId, role: 'attorney', supabaseUserId: secondUserId, active: true },
      { id: thirdUserId, firmId: otherFirmId, role: 'admin', supabaseUserId: thirdUserId, active: true },
    ]);
    const cacheInvalidations = []; const audit = transactionAudit();
    const service = new UserRoleService({ userRepository: repository, auditService: audit, roleFirmResolver: { async invalidate(id) { cacheInvalidations.push(id); } } });
    assert.deepEqual(await service.changeRole({ firmId, actorUserId, targetUserId: entityId, input: { role: 'viewer' } }), { id: entityId, role: 'viewer', active: true });
    assert.equal(audit.calls[0].action, AUDIT_ACTIONS.USER_ROLE_CHANGED);
    assert.equal(audit.calls[0].beforeState.role, 'attorney');
    assert.deepEqual(cacheInvalidations, [secondUserId]);
    await assert.rejects(() => service.changeRole({ firmId, actorUserId, targetUserId: thirdUserId, input: { role: 'viewer' } }), { code: 'USER_NOT_FOUND' });
    await assert.rejects(() => service.changeRole({ firmId, actorUserId, targetUserId: entityId, input: { role: 'viewer' } }), { code: 'USER_ROLE_NOOP' });
    await assert.rejects(() => service.changeRole({ firmId, actorUserId, targetUserId: localActorId, input: { role: 'viewer' } }), { code: 'LAST_ACTIVE_ADMIN' });
  });

  it('allows self-demotion only when another active Admin remains, and rolls it back if auditing fails', async () => {
    const repository = roleRepository([
      { id: localActorId, firmId, role: 'admin', supabaseUserId: actorUserId, active: true },
      { id: entityId, firmId, role: 'admin', supabaseUserId: secondUserId, active: true },
    ]);
    const service = new UserRoleService({ userRepository: repository, auditService: transactionAudit({ fail: true }), roleFirmResolver: { async invalidate() {} } });
    await assert.rejects(() => service.changeRole({ firmId, actorUserId, targetUserId: localActorId, input: { role: 'viewer' } }));
    assert.equal(repository.state.users.find((user) => user.id === localActorId).role, 'admin');
    assert.equal(repository.state.rolledBack, 1);
  });

  it('enforces Admin-only firm-scoped audit reads and role writes', async () => {
    const identities = {
      admin: { userId: actorUserId, firmId, role: 'admin' },
      attorney: { userId: actorUserId, firmId, role: 'attorney' },
      viewer: { userId: actorUserId, firmId, role: 'viewer' },
    };
    const authenticate = (req, _res, next) => {
      const identity = identities[req.get('authorization')];
      if (!identity) return next(unauthorized()); req.auth = identity; return next();
    };
    const calls = [];
    const app = express(); app.use(express.json());
    app.use('/api/v1', createAuditLogRouter(authenticate, { async list(payload) { calls.push(payload); return { auditLogs: [], nextCursor: null }; } }));
    app.use('/api/v1', createUserRouter(authenticate, { async changeRole(payload) { calls.push(payload); return { id: entityId, role: 'viewer', active: true }; } }));
    app.use(errorHandler);
    assert.equal((await request(app).get('/api/v1/audit-logs').set('Authorization', 'admin')).status, 200);
    assert.equal((await request(app).get('/api/v1/audit-logs').set('Authorization', 'attorney')).status, 403);
    assert.equal((await request(app).get('/api/v1/audit-logs').set('Authorization', 'viewer')).status, 403);
    assert.equal((await request(app).patch(`/api/v1/users/${entityId}/role`).set('Authorization', 'attorney').send({ role: 'viewer' })).status, 403);
    assert.equal((await request(app).patch(`/api/v1/users/${entityId}/role`).set('Authorization', 'viewer').send({ role: 'viewer' })).status, 403);
    const changed = await request(app).patch(`/api/v1/users/${entityId}/role`).set('Authorization', 'admin').send({ role: 'viewer' });
    assert.equal(changed.status, 200);
    assert.equal(calls[0].firmId, firmId);
    assert.equal(calls[1].firmId, firmId);
  });
});

describe('audit request context', () => {
  it('preserves valid request IDs and uses forwarded IPs only under explicit proxy trust', () => {
    const request = {
      get(name) { return { 'x-request-id': 'request-123', 'user-agent': 'audit-test', 'x-forwarded-for': '198.51.100.8' }[name] ?? undefined; },
      socket: { remoteAddress: '203.0.113.1' },
      ip: '198.51.100.8', app: { get() { return false; } },
    };
    assert.deepEqual(captureAuditRequestContext(request), { requestId: 'request-123', ipAddress: '203.0.113.1', userAgent: 'audit-test' });
    request.app.get = () => 1;
    assert.equal(captureAuditRequestContext(request).ipAddress, '198.51.100.8');
  });
});
