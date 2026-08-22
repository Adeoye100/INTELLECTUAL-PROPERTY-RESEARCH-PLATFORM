import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { parseAuditLogListQuery } from '../audit/audit-service.js';

function validateAuditLogList(request, _response, next) {
  try {
    const parsed = parseAuditLogListQuery(request.query);
    request.auditLogFilters = parsed.filters;
    request.auditLogPagination = parsed.pagination;
    next();
  } catch (error) {
    next(error);
  }
}

export function createAuditLogRouter(authenticate, auditService) {
  if ((typeof authenticate !== 'function' && !Array.isArray(authenticate)) || !auditService) {
    throw new TypeError('createAuditLogRouter needs authentication middleware and an audit service.');
  }
  const router = Router();
  router.get('/audit-logs', authenticate, requireRole(['admin']), validateAuditLogList,
    async (request, response) => response.json(await auditService.list({
      firmId: request.auth.firmId,
      filters: request.auditLogFilters,
      pagination: request.auditLogPagination,
    })));
  return router;
}
