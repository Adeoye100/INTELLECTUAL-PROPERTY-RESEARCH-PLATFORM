import { AppError, conflict, forbidden } from '../errors.js';
import { UUID_PATTERN } from '../watch/watch-validation.js';
import { parseAlertAction, parseAlertFilters, parseAlertId, parseAlertPagination } from './alert-validation.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit-taxonomy.js';
import { alertAuditSnapshot } from '../audit/audit-snapshots.js';

const notFound = () => new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found.');
function firm(value) { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw forbidden('A firm membership is required.'); return value; }
function at(clock) { const value = clock(); if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError('Alert clock must return a valid Date.'); return value.toISOString(); }
function actor(value) { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw forbidden('A verified user identity is required.'); return value; }

export class AlertService {
  constructor({ repository, clock = () => new Date(), auditService = null }) {
    if (!repository || ['list', 'get', 'transition'].some((method) => typeof repository[method] !== 'function')) {
      throw new TypeError('AlertService needs an alert repository.');
    }
    if (auditService && (typeof auditService.record !== 'function' || typeof repository.withTransaction !== 'function')) {
      throw new TypeError('Audited alert mutations need an audit service and transaction-capable repository.');
    }
    this.repository = repository; this.clock = clock; this.auditService = auditService;
  }
  async listAlerts({ firmId, filters, pagination }) {
    const pages = parseAlertPagination(pagination ?? {});
    const result = await this.repository.list({ firmId: firm(firmId), filters: parseAlertFilters(filters ?? {}), pagination: pages });
    return { items: result.items, pagination: { page: pages.page, pageSize: pages.pageSize, total: result.total, totalPages: Math.ceil(result.total / pages.pageSize) } };
  }
  async getAlert({ firmId, alertId }) {
    const found = await this.repository.get({ firmId: firm(firmId), alertId: parseAlertId(alertId) });
    if (!found) throw notFound(); return found;
  }
  async transitionAlert({ firmId, actorUserId, alertId, input, requestContext = null }) {
    const scopedFirm = firm(firmId); const id = parseAlertId(alertId); const action = parseAlertAction(input);
    if (!this.auditService) {
      if (await this.repository.transition({ firmId: scopedFirm, alertId: id, action, at: at(this.clock) })) return this.getAlert({ firmId: scopedFirm, alertId: id });
      if (!await this.repository.get({ firmId: scopedFirm, alertId: id })) throw notFound();
      throw conflict('ALERT_STATE_CONFLICT', 'This alert cannot transition using the requested action.');
    }
    const scopedActorUserId = actor(actorUserId);
    return this.repository.withTransaction(async (transaction) => {
      const before = await this.repository.get({ firmId: scopedFirm, alertId: id, transaction });
      if (!before) throw notFound();
      const transitioned = await this.repository.transition({
        firmId: scopedFirm, alertId: id, action, at: at(this.clock), transaction,
      });
      if (!transitioned) throw conflict('ALERT_STATE_CONFLICT', 'This alert cannot transition using the requested action.');
      const updated = await this.repository.get({ firmId: scopedFirm, alertId: id, transaction });
      await this.auditService.record({
        transaction, requireTransaction: true, firmId: scopedFirm, actorUserId: scopedActorUserId,
        action: action === 'read' ? AUDIT_ACTIONS.ALERT_READ : AUDIT_ACTIONS.ALERT_DISMISSED,
        entityType: AUDIT_ENTITY_TYPES.ALERT, entityId: id,
        beforeState: alertAuditSnapshot(before), afterState: alertAuditSnapshot(updated),
        metadata: { changedFields: action === 'read' ? ['status', 'readAt'] : ['status', 'dismissedAt'] },
        requestContext,
      });
      return updated;
    });
  }
}

function validation(handler) { return (request, _response, next) => { try { handler(request); next(); } catch (error) { next(error); } }; }
export const validateAlertId = validation((request) => { request.alertId = parseAlertId(request.params.id); });
export const validateAlertList = validation((request) => {
  // Validate at the HTTP boundary while leaving raw query scalars for the
  // service's own idempotent validation path.
  parseAlertFilters(request.query);
  parseAlertPagination(request.query);
  request.alertFilters = request.query;
  request.alertPagination = request.query;
});
export const validateAlertAction = validation((request) => { request.alertId = parseAlertId(request.params.id); request.alertAction = parseAlertAction(request.body); });
