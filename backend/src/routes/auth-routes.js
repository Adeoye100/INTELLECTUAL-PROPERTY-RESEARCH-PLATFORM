import { Router } from 'express';

export function createAuthRouter(authService) {
  const router = Router();

  // BE-15 rate limiting belongs immediately before these handlers. BE-16 audit
  // events belong after successful signup/login/refresh/logout state changes.
  router.post('/signup', async (request, response) => {
    response.status(201).json(await authService.signup(request.body));
  });
  router.get('/invitations/:token', async (request, response) => {
    response.json(await authService.invitationDetails(request.params.token));
  });
  router.post('/invitations/:token/accept', async (request, response) => {
    response.status(201).json(await authService.acceptInvitation(request.params.token, request.body));
  });

  return router;
}
