import express from 'express';
import { errorHandler } from './errors.js';
import { createAuthRouter } from './routes/auth-routes.js';
import { createProtectedRouter } from './routes/protected-routes.js';

export function createApp({ authService, authenticate }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.use('/api/v1/auth', createAuthRouter(authService));
  app.use('/api/v1', createProtectedRouter(authenticate));

  app.use((_request, response) => {
    response.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found.' });
  });
  app.use(errorHandler);
  return app;
}
