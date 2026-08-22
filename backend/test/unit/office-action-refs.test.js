import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { AppError, errorHandler, unauthorized } from '../../src/errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../src/audit/audit-taxonomy.js';
import { AuditService } from '../../src/audit/audit-service.js';
import { OfficeActionRefRepository } from '../../src/office-actions/office-action-ref-repository.js';
import { OfficeActionRefService } from '../../src/office-actions/office-action-ref-service.js';
import { createOfficeActionRefRouter } from '../../src/routes/office-action-routes.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const portfolioMarkId = '44444444-4444-4444-8444-444444444444';
const officeActionRefId = '55555555-5555-4555-8555-555555555555';

const createInput = Object.freeze({
  sourceRegistry: ' uspto ', sourceReferenceId: ' US-123 ', applicationNumber: ' 88/123456 ',
  documentType: 'non_final_office_action', officeActionDate: '2026-08-01', examinerName: null,
  examinerReasoningSummary: 'The registry record identifies a likelihood-of-confusion refusal.',
  summaryMethod: 'registry', sourceDocumentUrl: 'https://registry.example.test/documents/US-123',
  sourceMetadata: { documentTitle: 'Office Action', documentLanguage: 'en' },
});

const record = Object.freeze({
  id: officeActionRefId, firmId, portfolioMarkId, sourceRegistry: 'USPTO', sourceReferenceId: 'US-123',
  applicationNumber: '88/123456', documentType: 'non_final_office_action', officeActionDate: '2026-08-01',
  examinerName: null, examinerReasoningSummary: 'The registry record identifies a likelihood-of-confusion refusal.',
  summaryMethod: 'registry', sourceDocumentUrl: 'https://registry.example.test/documents/US-123',
  sourceMetadata: { documentTitle: 'Office Action', documentLanguage: 'en' }, linkedByUserId: actorUserId,
  createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z',
});

function transactionalRepository({ portfolioExists = true, recordValue = record, createError = null } = {}) {
  const state = { record: recordValue ? structuredClone(recordValue) : null, rolledBack: 0, committed: 0, calls: [] };
  return {
    state,
    async withTransaction(work) {
      const previous = structuredClone(state.record);
      try { const result = await work({ async query() {} }); state.committed += 1; return result; } catch (error) { state.record = previous; state.rolledBack += 1; throw error; }
    },
    async portfolioMarkExists(payload) { state.calls.push(['portfolioMarkExists', payload]); return portfolioExists && payload.firmId === firmId; },
    async create(payload) {
      state.calls.push(['create', payload]);
      if (createError) throw createError;
      state.record = { ...structuredClone(record), ...payload.input, portfolioMarkId: payload.portfolioMarkId };
      return structuredClone(state.record);
    },
    async list(payload) { state.calls.push(['list', payload]); return { items: state.record ? [structuredClone(state.record)] : [], total: state.record ? 1 : 0 }; },
    async get(payload) {
      state.calls.push(['get', payload]);
      return state.record && payload.firmId === firmId && payload.portfolioMarkId === portfolioMarkId && payload.officeActionRefId === officeActionRefId
        ? structuredClone(state.record) : null;
    },
    async update(payload) {
      state.calls.push(['update', payload]);
      if (!state.record || payload.firmId !== firmId || payload.portfolioMarkId !== portfolioMarkId || payload.officeActionRefId !== officeActionRefId) return null;
      Object.assign(state.record, payload.input);
      return structuredClone(state.record);
    },
    async delete(payload) {
      state.calls.push(['delete', payload]);
      if (!state.record || payload.firmId !== firmId || payload.portfolioMarkId !== portfolioMarkId || payload.officeActionRefId !== officeActionRefId) return false;
      state.record = null;
      return true;
    },
  };
}

function audit({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async record(payload) {
      calls.push(payload);
      if (fail) throw new Error('audit write failure');
      return { id: officeActionRefId };
    },
  };
}

function routeApp(service, calls = []) {
  const identities = {
    'admin-token': { userId: actorUserId, firmId, role: 'admin' },
    'attorney-token': { userId: actorUserId, firmId, role: 'attorney' },
    'viewer-token': { userId: actorUserId, firmId, role: 'viewer' },
  };
  const authenticate = (req, _res, next) => {
    const identity = identities[req.get('authorization')?.replace('Bearer ', '')];
    if (!identity) return next(unauthorized());
    req.auth = identity;
    return next();
  };
  const defaults = {
    async createOfficeActionRef(payload) { calls.push(['create', payload]); return record; },
    async listOfficeActionRefs(payload) { calls.push(['list', payload]); return { items: [record], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } }; },
    async getOfficeActionRef(payload) { calls.push(['get', payload]); return record; },
    async updateOfficeActionRef(payload) { calls.push(['update', payload]); return { ...record, ...payload.input }; },
    async deleteOfficeActionRef(payload) { calls.push(['delete', payload]); },
  };
  const wrapped = { ...defaults, ...service };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createOfficeActionRefRouter(authenticate, wrapped));
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found.' }));
  app.use(errorHandler);
  return app;
}

describe('Office Action reference schema, service, and repository', () => {
  it('defines the additive tenant-scoped table, provenance uniqueness, indexes, and audit taxonomy extension', async () => {
    const migration = await readFile(new URL('../../migrations/010_create_office_action_refs.sql', import.meta.url), 'utf8');
    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS office_action_refs', 'firm_id uuid NOT NULL REFERENCES firms(id)',
      'portfolio_mark_id uuid NOT NULL', 'source_reference_id varchar(200) NOT NULL',
      'office_action_refs_portfolio_mark_firm_key', 'linked_by_user_id uuid NOT NULL REFERENCES users(id)',
      "source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb", 'office_action_refs_summary_method_valid',
      'office_action_refs_firm_mark_source_reference_key', 'office_action_refs_firm_portfolio_mark_idx',
      'office_action_refs_source_reference_idx', 'office_action_refs_application_number_idx',
      'office_action_refs_office_action_date_idx', 'office_action_ref.created', 'office_action_ref.updated',
      'office_action_ref.deleted', 'office_action_ref',
    ]) assert.match(migration, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(AUDIT_ACTIONS.OFFICE_ACTION_REF_CREATED, 'office_action_ref.created');
    assert.equal(AUDIT_ENTITY_TYPES.OFFICE_ACTION_REF, 'office_action_ref');
  });

  it('accepts the new immutable Office Action audit action and entity type', async () => {
    const auditService = new AuditService({
      idGenerator: () => '66666666-6666-4666-8666-666666666666',
      repository: {
        async insert(payload) {
          return {
            id: payload.id, firmId: payload.firmId, actorUserId, action: payload.action,
            entityType: payload.entityType, entityId: payload.entityId, beforeState: payload.beforeState,
            afterState: payload.afterState, metadata: payload.metadata, requestId: null,
            ipAddress: null, userAgent: null, occurredAt: payload.occurredAt, createdAt: payload.occurredAt,
          };
        },
      },
    });
    const inserted = await auditService.record({
      firmId, actorUserId, action: AUDIT_ACTIONS.OFFICE_ACTION_REF_CREATED,
      entityType: AUDIT_ENTITY_TYPES.OFFICE_ACTION_REF, entityId: officeActionRefId,
      afterState: { id: officeActionRefId, sourceReferenceId: 'US-123' }, metadata: { changedFields: ['sourceReferenceId'] },
    });
    assert.equal(inserted.action, 'office_action_ref.created');
    assert.equal(inserted.entityType, 'office_action_ref');
  });

  it('creates, lists, gets, updates, and deletes firm-scoped refs with safe audit snapshots', async () => {
    const repository = transactionalRepository();
    const recorded = audit();
    const service = new OfficeActionRefService({ repository, auditService: recorded });
    const created = await service.createOfficeActionRef({ firmId, actorUserId, portfolioMarkId, input: createInput });
    assert.equal(created.sourceReferenceId, 'US-123');
    assert.deepEqual(await service.listOfficeActionRefs({ firmId, portfolioMarkId, pagination: {} }), {
      items: [created], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    assert.equal((await service.getOfficeActionRef({ firmId, portfolioMarkId, officeActionRefId })).id, officeActionRefId);
    const updated = await service.updateOfficeActionRef({
      firmId, actorUserId, portfolioMarkId, officeActionRefId,
      input: { examinerReasoningSummary: null, summaryMethod: 'manual', sourceMetadata: { documentTitle: 'Corrected' } },
    });
    assert.equal(updated.examinerReasoningSummary, null);
    await service.deleteOfficeActionRef({ firmId, actorUserId, portfolioMarkId, officeActionRefId });
    assert.deepEqual(recorded.calls.map((entry) => entry.action), [
      AUDIT_ACTIONS.OFFICE_ACTION_REF_CREATED,
      AUDIT_ACTIONS.OFFICE_ACTION_REF_UPDATED,
      AUDIT_ACTIONS.OFFICE_ACTION_REF_DELETED,
    ]);
    assert.equal(recorded.calls.every((entry) => entry.entityType === AUDIT_ENTITY_TYPES.OFFICE_ACTION_REF), true);
    assert.equal(JSON.stringify(recorded.calls).includes('rawDocument'), false);
    assert.equal(repository.state.calls.every(([, payload]) => payload.firmId === firmId), true);
  });

  it('rejects duplicate, immutable provenance, unsafe summary/metadata, and hides cross-firm resources', async () => {
    const duplicate = new OfficeActionRefService({
      repository: transactionalRepository({ createError: { code: '23505', constraint: 'office_action_refs_firm_mark_source_reference_key' } }),
    });
    await assert.rejects(
      () => duplicate.createOfficeActionRef({ firmId, actorUserId, portfolioMarkId, input: createInput }),
      { code: 'OFFICE_ACTION_REF_CONFLICT' },
    );
    const service = new OfficeActionRefService({ repository: transactionalRepository() });
    for (const input of [
      { sourceRegistry: 'EUIPO' }, { sourceReferenceId: 'other' }, { linkedByUserId: actorUserId },
      { examinerReasoningSummary: '<b>not plain text</b>' }, { summaryMethod: 'generated' },
      { sourceMetadata: { rawDocument: 'too much' } }, { sourceMetadata: { documentTitle: 'x'.repeat(201) } },
    ]) await assert.rejects(
      () => service.updateOfficeActionRef({ firmId, actorUserId, portfolioMarkId, officeActionRefId, input }),
      { code: 'VALIDATION_ERROR' },
    );
    const inaccessible = new OfficeActionRefService({ repository: transactionalRepository({ portfolioExists: false }) });
    await assert.rejects(
      () => inaccessible.getOfficeActionRef({ firmId: otherFirmId, portfolioMarkId, officeActionRefId }),
      { code: 'PORTFOLIO_MARK_NOT_FOUND' },
    );
    const missing = new OfficeActionRefService({ repository: transactionalRepository({ recordValue: null }) });
    await assert.rejects(
      () => missing.getOfficeActionRef({ firmId, portfolioMarkId, officeActionRefId }),
      { code: 'OFFICE_ACTION_REF_NOT_FOUND' },
    );
  });

  it('rolls back a reference mutation when audit insertion fails', async () => {
    const repository = transactionalRepository();
    const service = new OfficeActionRefService({ repository, auditService: audit({ fail: true }) });
    await assert.rejects(() => service.updateOfficeActionRef({
      firmId, actorUserId, portfolioMarkId, officeActionRefId, input: { examinerName: 'Examiner Name' },
    }));
    assert.equal(repository.state.record.examinerName, null);
    assert.equal(repository.state.rolledBack, 1);
  });

  it('uses parameterized firm and portfolio-scoped SQL with deterministic bounded lists', async () => {
    const calls = [];
    const row = {
      id: officeActionRefId, firm_id: firmId, portfolio_mark_id: portfolioMarkId, source_registry: 'USPTO',
      source_reference_id: 'US-123', application_number: null, document_type: 'office_action', office_action_date: null,
      examiner_name: null, examiner_reasoning_summary: null, summary_method: 'registry', source_document_url: null,
      source_metadata: {}, linked_by_user_id: actorUserId, created_at: new Date(), updated_at: new Date(),
    };
    const client = { async query(sql, values = []) { calls.push([sql, values]); return { rowCount: 1, rows: [row] }; }, release() {} };
    const database = {
      async query(sql, values = []) { calls.push([sql, values]); return sql.includes('count(*)') ? { rowCount: 1, rows: [{ total: 1 }] } : { rowCount: 1, rows: [row] }; },
      async connect() { return client; },
    };
    const repository = new OfficeActionRefRepository(database);
    await repository.portfolioMarkExists({ firmId, portfolioMarkId });
    await repository.create({ firmId, actorUserId, portfolioMarkId, input: { ...createInput, sourceRegistry: 'USPTO', sourceReferenceId: 'US-123' } });
    await repository.list({ firmId, portfolioMarkId, pagination: { page: 1, pageSize: 10 } });
    await repository.get({ firmId, portfolioMarkId, officeActionRefId });
    await repository.update({ firmId, portfolioMarkId, officeActionRefId, input: { examinerName: null } });
    await repository.delete({ firmId, portfolioMarkId, officeActionRefId });
    const sql = calls.map(([statement]) => statement).join('\n');
    assert.match(sql, /WHERE firm_id = \$1 AND portfolio_mark_id = \$2/);
    assert.match(sql, /ORDER BY office_action_date DESC NULLS LAST, created_at DESC, id DESC/);
    assert.match(sql, /DELETE FROM office_action_refs/);
    assert.equal(sql.includes(firmId), false);
  });
});

describe('Office Action reference routes', () => {
  it('enforces auth/RBAC, validates before service, scopes actor and firm, and keeps Viewer read-only', async () => {
    const calls = [];
    const app = routeApp({}, calls);
    const base = `/api/v1/portfolio-marks/${portfolioMarkId}/office-action-refs`;
    assert.equal((await request(app).get(base)).status, 401);
    for (const token of ['admin-token', 'attorney-token', 'viewer-token']) {
      assert.equal((await request(app).get(base).set('Authorization', `Bearer ${token}`)).status, 200);
      assert.equal((await request(app).get(`${base}/${officeActionRefId}`).set('Authorization', `Bearer ${token}`)).status, 200);
    }
    for (const token of ['admin-token', 'attorney-token']) {
      assert.equal((await request(app).post(base).set('Authorization', `Bearer ${token}`).send(createInput)).status, 201);
      assert.equal((await request(app).patch(`${base}/${officeActionRefId}`).set('Authorization', `Bearer ${token}`).send({ examinerName: 'Name' })).status, 200);
      assert.equal((await request(app).delete(`${base}/${officeActionRefId}`).set('Authorization', `Bearer ${token}`)).status, 204);
    }
    assert.equal((await request(app).post(base).set('Authorization', 'Bearer viewer-token').send(createInput)).status, 403);
    assert.equal((await request(app).patch(`${base}/${officeActionRefId}`).set('Authorization', 'Bearer viewer-token').send({ examinerName: 'Name' })).status, 403);
    assert.equal((await request(app).delete(`${base}/${officeActionRefId}`).set('Authorization', 'Bearer viewer-token')).status, 403);
    const before = calls.length;
    assert.equal((await request(app).post(base).set('Authorization', 'Bearer admin-token').send({ ...createInput, firmId: otherFirmId })).status, 400);
    assert.equal(calls.length, before);
    const createCall = calls.find(([name]) => name === 'create');
    assert.equal(createCall[1].firmId, firmId);
    assert.equal(createCall[1].actorUserId, actorUserId);
  });

  it('preserves safe cross-firm and missing responses from the service', async () => {
    const service = {
      async createOfficeActionRef() { throw new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.'); },
      async listOfficeActionRefs() { throw new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.'); },
      async getOfficeActionRef() { throw new AppError(404, 'OFFICE_ACTION_REF_NOT_FOUND', 'Office Action reference not found.'); },
      async updateOfficeActionRef() { throw new AppError(404, 'OFFICE_ACTION_REF_NOT_FOUND', 'Office Action reference not found.'); },
      async deleteOfficeActionRef() { throw new AppError(404, 'OFFICE_ACTION_REF_NOT_FOUND', 'Office Action reference not found.'); },
    };
    const app = routeApp(service);
    const base = `/api/v1/portfolio-marks/${portfolioMarkId}/office-action-refs`;
    const response = await request(app).get(`${base}/${officeActionRefId}`).set('Authorization', 'Bearer admin-token');
    assert.equal(response.status, 404);
    assert.equal(response.body.code, 'OFFICE_ACTION_REF_NOT_FOUND');
  });
});
