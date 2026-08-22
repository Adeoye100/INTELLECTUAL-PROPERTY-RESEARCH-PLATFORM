import { AppError, conflict, forbidden } from '../errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit-taxonomy.js';
import { officeActionRefAuditSnapshot } from '../audit/audit-snapshots.js';
import {
  parseOfficeActionRefCreate,
  parseOfficeActionRefId,
  parseOfficeActionRefPagination,
  parseOfficeActionRefPatch,
} from './office-action-validation.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scopedFirm(firmId) {
  if (typeof firmId !== 'string' || !UUID_PATTERN.test(firmId)) throw forbidden('A firm membership is required.');
  return firmId;
}

function scopedActor(actorUserId) {
  if (typeof actorUserId !== 'string' || !UUID_PATTERN.test(actorUserId)) {
    throw forbidden('A verified user identity is required.');
  }
  return actorUserId;
}

function portfolioMarkNotFound() {
  return new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.');
}

function officeActionRefNotFound() {
  return new AppError(404, 'OFFICE_ACTION_REF_NOT_FOUND', 'Office Action reference not found.');
}

function normalizeDatabaseError(error) {
  if (error?.code === '23505' && error?.constraint === 'office_action_refs_firm_mark_source_reference_key') {
    return conflict(
      'OFFICE_ACTION_REF_CONFLICT',
      'This Office Action reference is already linked to the portfolio mark.',
    );
  }
  return error;
}

export class OfficeActionRefService {
  constructor({ repository, auditService = null }) {
    const methods = ['portfolioMarkExists', 'create', 'list', 'get', 'update', 'delete'];
    if (!repository || methods.some((method) => typeof repository[method] !== 'function')) {
      throw new TypeError('OfficeActionRefService needs an Office Action reference repository.');
    }
    if (auditService && (typeof auditService.record !== 'function' || typeof repository.withTransaction !== 'function')) {
      throw new TypeError('Audited Office Action mutations need an audit service and transaction-capable repository.');
    }
    this.repository = repository;
    this.auditService = auditService;
  }

  async assertPortfolioMark({ firmId, portfolioMarkId, transaction = null }) {
    const found = await this.repository.portfolioMarkExists({ firmId, portfolioMarkId, transaction });
    if (!found) throw portfolioMarkNotFound();
  }

  async createOfficeActionRef({ firmId, actorUserId, portfolioMarkId, input, requestContext = null }) {
    const scopedFirmId = scopedFirm(firmId);
    const scopedActorUserId = scopedActor(actorUserId);
    const parsedPortfolioMarkId = parseOfficeActionRefId(portfolioMarkId, 'portfolioMarkId');
    const parsed = parseOfficeActionRefCreate(input);
    try {
      if (!this.auditService) {
        await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId });
        const record = await this.repository.create({
          firmId: scopedFirmId, actorUserId: scopedActorUserId, portfolioMarkId: parsedPortfolioMarkId, input: parsed,
        });
        if (!record) throw officeActionRefNotFound();
        return record;
      }
      return await this.repository.withTransaction(async (transaction) => {
        await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, transaction });
        const record = await this.repository.create({
          firmId: scopedFirmId, actorUserId: scopedActorUserId, portfolioMarkId: parsedPortfolioMarkId,
          input: parsed, transaction,
        });
        if (!record) throw officeActionRefNotFound();
        await this.auditService.record({
          transaction, requireTransaction: true, firmId: scopedFirmId, actorUserId: scopedActorUserId,
          action: AUDIT_ACTIONS.OFFICE_ACTION_REF_CREATED,
          entityType: AUDIT_ENTITY_TYPES.OFFICE_ACTION_REF,
          entityId: record.id, beforeState: null, afterState: officeActionRefAuditSnapshot(record),
          metadata: { changedFields: Object.keys(parsed) }, requestContext,
        });
        return record;
      });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async listOfficeActionRefs({ firmId, portfolioMarkId, pagination }) {
    const scopedFirmId = scopedFirm(firmId);
    const parsedPortfolioMarkId = parseOfficeActionRefId(portfolioMarkId, 'portfolioMarkId');
    const parsedPagination = parseOfficeActionRefPagination(pagination ?? {});
    await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId });
    const result = await this.repository.list({
      firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, pagination: parsedPagination,
    });
    return {
      items: result.items,
      pagination: {
        page: parsedPagination.page,
        pageSize: parsedPagination.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / parsedPagination.pageSize),
      },
    };
  }

  async getOfficeActionRef({ firmId, portfolioMarkId, officeActionRefId }) {
    const scopedFirmId = scopedFirm(firmId);
    const parsedPortfolioMarkId = parseOfficeActionRefId(portfolioMarkId, 'portfolioMarkId');
    const parsedOfficeActionRefId = parseOfficeActionRefId(officeActionRefId);
    await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId });
    const record = await this.repository.get({
      firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, officeActionRefId: parsedOfficeActionRefId,
    });
    if (!record) throw officeActionRefNotFound();
    return record;
  }

  async updateOfficeActionRef({ firmId, actorUserId, portfolioMarkId, officeActionRefId, input, requestContext = null }) {
    const scopedFirmId = scopedFirm(firmId);
    const scopedActorUserId = scopedActor(actorUserId);
    const parsedPortfolioMarkId = parseOfficeActionRefId(portfolioMarkId, 'portfolioMarkId');
    const parsedOfficeActionRefId = parseOfficeActionRefId(officeActionRefId);
    const parsed = parseOfficeActionRefPatch(input);
    if (!this.auditService) {
      await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId });
      const record = await this.repository.update({
        firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, officeActionRefId: parsedOfficeActionRefId, input: parsed,
      });
      if (!record) throw officeActionRefNotFound();
      return record;
    }
    return this.repository.withTransaction(async (transaction) => {
      await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, transaction });
      const before = await this.repository.get({
        firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, officeActionRefId: parsedOfficeActionRefId, transaction,
      });
      if (!before) throw officeActionRefNotFound();
      const record = await this.repository.update({
        firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, officeActionRefId: parsedOfficeActionRefId,
        input: parsed, transaction,
      });
      if (!record) throw officeActionRefNotFound();
      await this.auditService.record({
        transaction, requireTransaction: true, firmId: scopedFirmId, actorUserId: scopedActorUserId,
        action: AUDIT_ACTIONS.OFFICE_ACTION_REF_UPDATED,
        entityType: AUDIT_ENTITY_TYPES.OFFICE_ACTION_REF,
        entityId: record.id, beforeState: officeActionRefAuditSnapshot(before),
        afterState: officeActionRefAuditSnapshot(record), metadata: { changedFields: Object.keys(parsed) }, requestContext,
      });
      return record;
    });
  }

  async deleteOfficeActionRef({ firmId, actorUserId, portfolioMarkId, officeActionRefId, requestContext = null }) {
    const scopedFirmId = scopedFirm(firmId);
    const scopedActorUserId = scopedActor(actorUserId);
    const parsedPortfolioMarkId = parseOfficeActionRefId(portfolioMarkId, 'portfolioMarkId');
    const parsedOfficeActionRefId = parseOfficeActionRefId(officeActionRefId);
    if (!this.auditService) {
      await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId });
      const deleted = await this.repository.delete({
        firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, officeActionRefId: parsedOfficeActionRefId,
      });
      if (!deleted) throw officeActionRefNotFound();
      return;
    }
    await this.repository.withTransaction(async (transaction) => {
      await this.assertPortfolioMark({ firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, transaction });
      const before = await this.repository.get({
        firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, officeActionRefId: parsedOfficeActionRefId, transaction,
      });
      if (!before) throw officeActionRefNotFound();
      const deleted = await this.repository.delete({
        firmId: scopedFirmId, portfolioMarkId: parsedPortfolioMarkId, officeActionRefId: parsedOfficeActionRefId, transaction,
      });
      if (!deleted) throw officeActionRefNotFound();
      await this.auditService.record({
        transaction, requireTransaction: true, firmId: scopedFirmId, actorUserId: scopedActorUserId,
        action: AUDIT_ACTIONS.OFFICE_ACTION_REF_DELETED,
        entityType: AUDIT_ENTITY_TYPES.OFFICE_ACTION_REF,
        entityId: before.id, beforeState: officeActionRefAuditSnapshot(before), afterState: null,
        metadata: { changedFields: [] }, requestContext,
      });
    });
  }
}
