import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { validateAlertAction, validateAlertId, validateAlertList } from '../alerts/alert-service.js';

const READ_ROLES = ['admin', 'attorney', 'viewer'];
const WRITE_ROLES = ['admin', 'attorney'];

export function createAlertRouter(authenticate, alertService) {
  if ((typeof authenticate !== 'function' && !Array.isArray(authenticate)) || !alertService) throw new TypeError('createAlertRouter needs authentication middleware and an alert service.');
  const router = Router();
  router.get('/alerts', authenticate, requireRole(READ_ROLES), validateAlertList,
    async (request, response) => response.json(await alertService.listAlerts({ firmId: request.auth.firmId, filters: request.alertFilters, pagination: request.alertPagination })));
  router.get('/alerts/:id', authenticate, requireRole(READ_ROLES), validateAlertId,
    async (request, response) => response.json(await alertService.getAlert({ firmId: request.auth.firmId, alertId: request.alertId })));
  router.patch('/alerts/:id', authenticate, requireRole(WRITE_ROLES), validateAlertAction,
    async (request, response) => response.json(await alertService.transitionAlert({ firmId: request.auth.firmId, alertId: request.alertId, input: { action: request.alertAction } })));
  return router;
}
