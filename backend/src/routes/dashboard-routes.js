import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
const READ_ROLES = ['admin', 'attorney', 'viewer'];
export function createDashboardRouter(authenticate, service) {
  if (!service) throw new TypeError('createDashboardRouter needs an analytics service.');
  const router = Router();
  router.get('/dashboard/analytics', authenticate, requireRole(READ_ROLES), async (request, response) => response.json(await service.get({ firmId: request.auth.firmId, range: request.query.range })));
  return router;
}
