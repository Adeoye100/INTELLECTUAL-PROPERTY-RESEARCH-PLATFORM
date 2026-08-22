import { AppError, conflict, forbidden } from '../errors.js';
import {
  parseWatchCreate, parseWatchFilters, parseWatchId, parseWatchPagination, parseWatchPatch, UUID_PATTERN,
} from './watch-validation.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit-taxonomy.js';
import { watchAuditSnapshot } from '../audit/audit-snapshots.js';

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

const watchNotFound = () => new AppError(404, 'WATCH_NOT_FOUND', 'Watch not found.');
const markNotFound = () => new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.');

function normalizeDatabaseError(error) {
  if (error?.code === '23505' && error?.constraint === 'watches_one_enabled_per_mark_uidx') {
    return conflict('WATCH_CONFLICT', 'An enabled watch already exists for this portfolio mark.');
  }
  if (error?.code === '23503' && error?.constraint === 'watches_portfolio_mark_firm_key') return markNotFound();
  return error;
}

function nowIso(clock) {
  const now = clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Watch clock must return a valid Date.');
  return now.toISOString();
}

export class WatchService {
  constructor({ repository, defaultPollIntervalMinutes, clock = () => new Date(), auditService = null }) {
    if (!repository || ['portfolioMarkExists', 'create', 'list', 'get', 'update', 'delete'].some(
      (method) => typeof repository[method] !== 'function',
    )) throw new TypeError('WatchService needs a watch repository.');
    if (!Number.isSafeInteger(defaultPollIntervalMinutes) || defaultPollIntervalMinutes < 5 || defaultPollIntervalMinutes > 43_200) {
      throw new TypeError('WatchService needs a valid default polling interval.');
    }
    if (typeof clock !== 'function') throw new TypeError('WatchService needs a clock.');
    if (auditService && (typeof auditService.record !== 'function' || typeof repository.withTransaction !== 'function')) {
      throw new TypeError('Audited watch mutations need an audit service and transaction-capable repository.');
    }
    this.repository = repository;
    this.defaultPollIntervalMinutes = defaultPollIntervalMinutes;
    this.clock = clock;
    this.auditService = auditService;
  }

  async createWatch({ firmId, actorUserId, input, requestContext = null }) {
    const scopedFirmId = scopedFirm(firmId);
    const parsed = parseWatchCreate(input, this.defaultPollIntervalMinutes);
    try {
      const scopedActorUserId = scopedActor(actorUserId);
      if (!this.auditService) {
        if (!await this.repository.portfolioMarkExists({ firmId: scopedFirmId, portfolioMarkId: parsed.portfolioMarkId })) {
          throw markNotFound();
        }
        return await this.repository.create({
          firmId: scopedFirmId, actorUserId: scopedActorUserId, input: parsed,
          nextPollAt: parsed.state === 'enabled' ? nowIso(this.clock) : null,
        });
      }
      return await this.repository.withTransaction(async (transaction) => {
        if (!await this.repository.portfolioMarkExists({
          firmId: scopedFirmId, portfolioMarkId: parsed.portfolioMarkId, transaction,
        })) throw markNotFound();
        const watch = await this.repository.create({
          firmId: scopedFirmId, actorUserId: scopedActorUserId, input: parsed,
          nextPollAt: parsed.state === 'enabled' ? nowIso(this.clock) : null, transaction,
        });
        if (!watch) throw markNotFound();
        await this.auditService.record({
          transaction, requireTransaction: true, firmId: scopedFirmId, actorUserId: scopedActorUserId,
          action: AUDIT_ACTIONS.WATCH_CREATED, entityType: AUDIT_ENTITY_TYPES.WATCH, entityId: watch.id,
          beforeState: null, afterState: watchAuditSnapshot(watch),
          metadata: { changedFields: ['portfolioMarkId', 'state', 'pollIntervalMinutes'] }, requestContext,
        });
        return watch;
      });
    } catch (error) { throw normalizeDatabaseError(error); }
  }

  async listWatches({ firmId, filters, pagination }) {
    const parsedPagination = parseWatchPagination(pagination ?? {});
    const result = await this.repository.list({
      firmId: scopedFirm(firmId), filters: parseWatchFilters(filters ?? {}), pagination: parsedPagination,
    });
    return {
      items: result.items,
      pagination: {
        page: parsedPagination.page, pageSize: parsedPagination.pageSize, total: result.total,
        totalPages: Math.ceil(result.total / parsedPagination.pageSize),
      },
    };
  }

  async getWatch({ firmId, watchId }) {
    const watch = await this.repository.get({ firmId: scopedFirm(firmId), watchId: parseWatchId(watchId) });
    if (!watch) throw watchNotFound();
    return watch;
  }

  async updateWatch({ firmId, actorUserId, watchId, input, requestContext = null }) {
    const parsed = parseWatchPatch(input);
    const changedFields = Object.keys(parsed);
    if (parsed.state === 'enabled') parsed.nextPollAt = nowIso(this.clock);
    if (parsed.state === 'paused') parsed.nextPollAt = null;
    try {
      const scopedFirmId = scopedFirm(firmId);
      const parsedWatchId = parseWatchId(watchId);
      if (!this.auditService) {
        const watch = await this.repository.update({ firmId: scopedFirmId, watchId: parsedWatchId, input: parsed });
        if (!watch) throw watchNotFound();
        return watch;
      }
      const scopedActorUserId = scopedActor(actorUserId);
      return await this.repository.withTransaction(async (transaction) => {
        const before = await this.repository.get({ firmId: scopedFirmId, watchId: parsedWatchId, transaction });
        if (!before) throw watchNotFound();
        const watch = await this.repository.update({
          firmId: scopedFirmId, watchId: parsedWatchId, input: parsed, transaction,
        });
        if (!watch) throw watchNotFound();
        const action = changedFields.includes('state') && before.state !== watch.state
          ? (watch.state === 'enabled' ? AUDIT_ACTIONS.WATCH_ENABLED : AUDIT_ACTIONS.WATCH_DISABLED)
          : AUDIT_ACTIONS.WATCH_UPDATED;
        await this.auditService.record({
          transaction, requireTransaction: true, firmId: scopedFirmId, actorUserId: scopedActorUserId,
          action, entityType: AUDIT_ENTITY_TYPES.WATCH, entityId: watch.id,
          beforeState: watchAuditSnapshot(before), afterState: watchAuditSnapshot(watch),
          metadata: { changedFields }, requestContext,
        });
        return watch;
      });
    } catch (error) { throw normalizeDatabaseError(error); }
  }

  async deleteWatch({ firmId, actorUserId, watchId, requestContext = null }) {
    const scopedFirmId = scopedFirm(firmId);
    const parsedWatchId = parseWatchId(watchId);
    if (!this.auditService) {
      if (!await this.repository.delete({ firmId: scopedFirmId, watchId: parsedWatchId })) throw watchNotFound();
      return;
    }
    const scopedActorUserId = scopedActor(actorUserId);
    await this.repository.withTransaction(async (transaction) => {
      const before = await this.repository.get({ firmId: scopedFirmId, watchId: parsedWatchId, transaction });
      if (!before) throw watchNotFound();
      if (!await this.repository.delete({ firmId: scopedFirmId, watchId: parsedWatchId, transaction })) {
        throw watchNotFound();
      }
      await this.auditService.record({
        transaction, requireTransaction: true, firmId: scopedFirmId, actorUserId: scopedActorUserId,
        action: AUDIT_ACTIONS.WATCH_DELETED, entityType: AUDIT_ENTITY_TYPES.WATCH, entityId: before.id,
        beforeState: watchAuditSnapshot(before), afterState: null,
        metadata: { changedFields: [] }, requestContext,
      });
    });
  }
}

function validation(middleware) {
  return (request, _response, next) => {
    try { middleware(request); next(); } catch (error) { next(error); }
  };
}

export function createValidateWatchCreate(defaultPollIntervalMinutes) {
  return validation((request) => {
    request.watchInput = parseWatchCreate(request.body, defaultPollIntervalMinutes);
  });
}
export const validateWatchPatch = validation((request) => {
  request.watchId = parseWatchId(request.params.id);
  request.watchInput = parseWatchPatch(request.body);
});
export const validateWatchId = validation((request) => { request.watchId = parseWatchId(request.params.id); });
export const validateWatchList = validation((request) => {
  request.watchFilters = parseWatchFilters(request.query);
  request.watchPagination = parseWatchPagination(request.query);
});
