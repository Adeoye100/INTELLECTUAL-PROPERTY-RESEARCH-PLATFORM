import express from 'express';
import { createCorsMiddleware } from './cors.js';
import { errorHandler } from './errors.js';
import { createAuthRouter } from './routes/auth-routes.js';
import { createProtectedRouter } from './routes/protected-routes.js';
import { createProvisioningRouter } from './routes/provisioning-routes.js';
import { createSearchRouter } from './routes/search-routes.js';
import { createSearchResultRouter } from './routes/search-result-routes.js';
import { createPortfolioMarkRouter } from './routes/portfolio-mark-routes.js';
import { createWatchRouter } from './routes/watch-routes.js';
import { createAlertRouter } from './routes/alert-routes.js';
import { createAuditLogRouter } from './routes/audit-log-routes.js';
import { createUserRouter } from './routes/user-routes.js';
import { createOfficeActionRefRouter, createOfficeActionSearchRouter } from './routes/office-action-routes.js';
import { createAuditRequestContextMiddleware } from './audit/request-context.js';
import { createExportRouter } from './routes/export-routes.js';
import {
  createRequestBoundsMiddleware,
  createSecurityHeadersMiddleware,
  MAX_JSON_BODY_BYTES,
} from './http-security.js';

export function createApp({
  authService, authenticate, authenticateIdentity, provisioningService, searchService = null,
  searchResultService = null,
  portfolioMarkService = null,
  watchService = null,
  alertService = null,
  auditService = null,
  userRoleService = null,
  officeActionSearchService = null,
  officeActionSearchMaxResults = 25,
  officeActionRefService = null,
  exportService = null,
  authRateLimiter = null,
  trustProxyHops = 0,
}) {
  if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error('trustProxyHops must be an integer between 0 and 10.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use(createSecurityHeadersMiddleware());
  app.use(createRequestBoundsMiddleware());
  app.use(createAuditRequestContextMiddleware());
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: MAX_JSON_BODY_BYTES }));

  app.use('/api/v1/auth', createAuthRouter(authService, { authRateLimiter }));
  app.use(
    '/api/v1/provisioning',
    createProvisioningRouter(authenticateIdentity, provisioningService, { authRateLimiter }),
  );
  app.use('/api/v1', createProtectedRouter(authenticate, authService, { authRateLimiter }));
  if (searchService && searchResultService) {
    app.use('/api/v1', createSearchRouter(authenticate, searchService, { searchResultService }));
  }
  if (searchResultService) {
    app.use('/api/v1', createSearchResultRouter(authenticate, searchResultService));
  }
  if (officeActionSearchService) {
    app.use('/api/v1', createOfficeActionSearchRouter(authenticate, officeActionSearchService, {
      maximumResults: officeActionSearchMaxResults,
    }));
  }
  if (portfolioMarkService) {
    app.use('/api/v1', createPortfolioMarkRouter(authenticate, portfolioMarkService));
  }
  if (watchService) {
    app.use('/api/v1', createWatchRouter(authenticate, watchService));
  }
  if (alertService) {
    app.use('/api/v1', createAlertRouter(authenticate, alertService));
  }
  if (auditService) {
    app.use('/api/v1', createAuditLogRouter(authenticate, auditService));
  }
  if (userRoleService) {
    app.use('/api/v1', createUserRouter(authenticate, userRoleService));
  }
  if (officeActionRefService) {
    app.use('/api/v1', createOfficeActionRefRouter(authenticate, officeActionRefService));
  }
  if (exportService) {
    app.use('/api/v1', createExportRouter(authenticate, exportService));
  }

  app.use((_request, response) => {
    response.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found.' });
  });
  app.use(errorHandler);
  return app;
}
