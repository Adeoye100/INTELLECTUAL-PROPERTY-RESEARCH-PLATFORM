import express from 'express';
import { createCorsMiddleware } from './cors.js';
import { errorHandler } from './errors.js';
import { createAuthRouter } from './routes/auth-routes.js';
import { createProtectedRouter } from './routes/protected-routes.js';
import { createProvisioningRouter } from './routes/provisioning-routes.js';
import { createSearchRouter } from './routes/search-routes.js';

export function createApp({
  authService, authenticate, authenticateIdentity, provisioningService, searchService = null,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '16kb' }));

  app.use('/api/v1/auth', createAuthRouter(authService));
  app.use(
    '/api/v1/provisioning',
    createProvisioningRouter(authenticateIdentity, provisioningService),
  );
  app.use('/api/v1', createProtectedRouter(authenticate, authService));
  if (searchService) {
    app.use('/api/v1', createSearchRouter(authenticate, searchService));
  }

  app.use((_request, response) => {
    response.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found.' });
  });
  app.use(errorHandler);
  return app;
}
