import { AppError, conflict, forbidden } from '../errors.js';
import { UUID_PATTERN } from '../watch/watch-validation.js';
import { parseAlertAction, parseAlertFilters, parseAlertId, parseAlertPagination } from './alert-validation.js';

const notFound = () => new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found.');
function firm(value) { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw forbidden('A firm membership is required.'); return value; }
function at(clock) { const value = clock(); if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError('Alert clock must return a valid Date.'); return value.toISOString(); }

export class AlertService {
  constructor({ repository, clock = () => new Date() }) {
    if (!repository || ['list', 'get', 'transition'].some((method) => typeof repository[method] !== 'function')) {
      throw new TypeError('AlertService needs an alert repository.');
    }
    this.repository = repository; this.clock = clock;
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
  async transitionAlert({ firmId, alertId, input }) {
    const scopedFirm = firm(firmId); const id = parseAlertId(alertId); const action = parseAlertAction(input);
    if (await this.repository.transition({ firmId: scopedFirm, alertId: id, action, at: at(this.clock) })) return this.getAlert({ firmId: scopedFirm, alertId: id });
    if (!await this.repository.get({ firmId: scopedFirm, alertId: id })) throw notFound();
    throw conflict('ALERT_STATE_CONFLICT', 'This alert cannot transition using the requested action.');
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
