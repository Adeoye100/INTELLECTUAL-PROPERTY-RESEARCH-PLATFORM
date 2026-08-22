import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import {
  createValidateWatchCreate, validateWatchId, validateWatchList, validateWatchPatch,
} from '../watch/watch-service.js';

const READ_ROLES = ['admin', 'attorney', 'viewer'];
const WRITE_ROLES = ['admin', 'attorney'];

export function createWatchRouter(authenticate, watchService) {
  if ((typeof authenticate !== 'function' && !Array.isArray(authenticate)) || !watchService) {
    throw new TypeError('createWatchRouter needs authentication middleware and a watch service.');
  }
  const router = Router();
  router.post('/watches', authenticate, requireRole(WRITE_ROLES),
    createValidateWatchCreate(watchService.defaultPollIntervalMinutes),
    async (request, response) => response.status(201).json(await watchService.createWatch({
      firmId: request.auth.firmId, actorUserId: request.auth.userId, input: request.watchInput,
      requestContext: request.auditContext,
    })));
  router.get('/watches', authenticate, requireRole(READ_ROLES), validateWatchList,
    async (request, response) => response.json(await watchService.listWatches({
      firmId: request.auth.firmId, filters: request.watchFilters, pagination: request.watchPagination,
    })));
  router.get('/watches/:id', authenticate, requireRole(READ_ROLES), validateWatchId,
    async (request, response) => response.json(await watchService.getWatch({
      firmId: request.auth.firmId, watchId: request.watchId,
    })));
  router.patch('/watches/:id', authenticate, requireRole(WRITE_ROLES), validateWatchPatch,
    async (request, response) => response.json(await watchService.updateWatch({
      firmId: request.auth.firmId, actorUserId: request.auth.userId,
      watchId: request.watchId, input: request.watchInput, requestContext: request.auditContext,
    })));
  router.delete('/watches/:id', authenticate, requireRole(WRITE_ROLES), validateWatchId,
    async (request, response) => {
      await watchService.deleteWatch({
        firmId: request.auth.firmId, actorUserId: request.auth.userId,
        watchId: request.watchId, requestContext: request.auditContext,
      });
      response.status(204).end();
    });
  return router;
}
