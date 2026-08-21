import { Router } from 'express';
import { createAuthIpRateLimit, resolveTrustedClientAddress } from '../auth/auth-rate-limiter.js';
import { validateInvitationAcceptance } from '../auth/auth-route-validation.js';

export function createAuthRouter(authService, { authRateLimiter = null } = {}) {
  const router = Router();
  const recoveryIpLimit = createAuthIpRateLimit({
    limiter: authRateLimiter, policyName: 'recoveryIp', failClosed: true,
  });

  // Invitation links are public and receive the recovery policy IP limit.
  // BE-16 audit events belong after successful redemption.
  router.get('/invitations/:token', resolveTrustedClientAddress, recoveryIpLimit, async (request, response) => {
    response.json(await authService.invitationDetails(request.params.token));
  });
  router.post('/invitations/:token/accept', resolveTrustedClientAddress, recoveryIpLimit, validateInvitationAcceptance, async (request, response) => {
    response.status(201).json(await authService.acceptInvitation(request.params.token, request.body));
  });

  return router;
}
