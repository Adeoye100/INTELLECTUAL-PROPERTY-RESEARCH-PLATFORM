import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { parseUserRoleChange } from '../users/user-role-service.js';
import { badRequest } from '../errors.js';
import { AUDIT_UUID_PATTERN } from '../audit/audit-service.js';

function validateUserRoleChange(request, _response, next) {
  try {
    if (typeof request.params.id !== 'string' || !AUDIT_UUID_PATTERN.test(request.params.id)) {
      throw badRequest('VALIDATION_ERROR', 'id must be a UUID.', { field: 'id' });
    }
    request.targetUserId = request.params.id;
    request.userRoleInput = { role: parseUserRoleChange(request.body) };
    next();
  } catch (error) {
    next(error);
  }
}

export function createUserRouter(authenticate, userRoleService) {
  if ((typeof authenticate !== 'function' && !Array.isArray(authenticate)) || !userRoleService) {
    throw new TypeError('createUserRouter needs authentication middleware and a user role service.');
  }
  const router = Router();
  router.patch('/users/:id/role', authenticate, requireRole(['admin']), validateUserRoleChange,
    async (request, response) => response.json(await userRoleService.changeRole({
      firmId: request.auth.firmId,
      actorUserId: request.auth.userId,
      targetUserId: request.targetUserId,
      input: request.userRoleInput,
      requestContext: request.auditContext,
    })));
  return router;
}
