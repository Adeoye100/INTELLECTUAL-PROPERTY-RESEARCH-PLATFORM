import { Router } from 'express';

export function createAuthRouter(authService) {
  const router = Router();

  // BE-15 rate limiting belongs immediately before these handlers. BE-16 audit
  // events belong after successful signup/login/refresh/logout state changes.
  router.post('/signup', async (request, response) => {
    response.status(201).json(await authService.signup(request.body));
  });
  router.post('/login', async (request, response) => {
    response.json(await authService.login(request.body));
  });
  router.post('/refresh', async (request, response) => {
    response.json(await authService.refresh(request.body));
  });
  router.post('/logout', async (request, response) => {
    await authService.logout(request.body);
    response.status(204).end();
  });

  return router;
}
