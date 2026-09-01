import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { createAuthIpRateLimit, resolveTrustedClientAddress } from '../auth/auth-rate-limiter.js';
import { validateInvitationIssue } from '../auth/auth-route-validation.js';
import { parseUserRoleChange } from '../users/user-role-service.js';
import { badRequest } from '../errors.js';
import { AUDIT_UUID_PATTERN } from '../audit/audit-service.js';

function validUuid(value, field) {
  if (typeof value !== 'string' || !AUDIT_UUID_PATTERN.test(value)) throw badRequest('VALIDATION_ERROR', `${field} must be a UUID.`, { field });
  return value;
}

function validateRoleChange(request, _response, next) {
  try {
    request.targetUserId = validUuid(request.params.userId, 'userId');
    request.userRoleInput = { role: parseUserRoleChange(request.body) };
    next();
  } catch (error) { next(error); }
}

export function createAdminRouter(authenticate, invitationService, userRoleService, { authRateLimiter = null } = {}) {
  const router = Router();
  const invitationIpLimit = createAuthIpRateLimit({ limiter: authRateLimiter, policyName: 'recoveryIp', failClosed: true });
  router.use(authenticate, requireRole(['admin']));
  router.get('/users', async (request, response) => response.json(await invitationService.listMembers(request.auth)));
  router.get('/invitations', async (request, response) => response.json(await invitationService.listInvitations(request.auth)));
  router.post('/invitations', resolveTrustedClientAddress, invitationIpLimit, validateInvitationIssue, async (request, response) => {
    response.status(201).json(await invitationService.issue(request.auth, request.body, request.auditContext));
  });
  router.post('/invitations/:invitationId/resend', resolveTrustedClientAddress, invitationIpLimit, async (request, response) => {
    response.json(await invitationService.resend(request.auth, request.params.invitationId, request.auditContext));
  });
  router.delete('/invitations/:invitationId', async (request, response) => {
    await invitationService.revoke(request.auth, request.params.invitationId, request.auditContext);
    response.status(204).end();
  });
  router.patch('/users/:userId/role', validateRoleChange, async (request, response) => {
    response.json(await userRoleService.changeRole({
      firmId: request.auth.firmId, actorUserId: request.auth.userId, targetUserId: request.targetUserId,
      input: request.userRoleInput, requestContext: request.auditContext,
    }));
  });
  return router;
}
