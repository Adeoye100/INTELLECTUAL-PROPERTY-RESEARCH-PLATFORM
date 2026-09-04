import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { parseMatterCreate, parseMatterRiskResultCreate } from '../matters/matter-validation.js';

const READ_ROLES = ['admin', 'attorney', 'viewer'];
const WRITE_ROLES = ['admin', 'attorney'];

export function createMatterRouter(authenticate, matterService) {
  if (typeof authenticate !== 'function' && !Array.isArray(authenticate)) {
    throw new TypeError('createMatterRouter needs authentication middleware.');
  }
  if (!matterService) throw new TypeError('createMatterRouter needs a matter service.');

  const router = Router();

  router.get('/matters', authenticate, requireRole(READ_ROLES), async (request, response, next) => {
    try {
      const page = Number(request.query.page) || 1;
      const pageSize = Number(request.query.pageSize) || 50;
      const result = await matterService.listMatters({ firmId: request.auth.firmId, page, pageSize });
      response.json(result);
    } catch (error) { next(error); }
  });

  router.post('/matters', authenticate, requireRole(WRITE_ROLES), async (request, response, next) => {
    try {
      const input = parseMatterCreate(request.body);
      const created = await matterService.createMatter({
        firmId: request.auth.firmId,
        createdByUserId: request.auth.userId,
        input,
      });
      response.status(201).json(created);
    } catch (error) { next(error); }
  });

  router.get('/matters/:id', authenticate, requireRole(READ_ROLES), async (request, response, next) => {
    try {
      const matter = await matterService.getMatter({ firmId: request.auth.firmId, id: request.params.id });
      response.json(matter);
    } catch (error) { next(error); }
  });

  router.post('/matters/:id/risk-results', authenticate, requireRole(WRITE_ROLES), async (request, response, next) => {
    try {
      const input = parseMatterRiskResultCreate(request.body);
      const result = await matterService.saveRiskResult({
        firmId: request.auth.firmId,
        matterId: request.params.id,
        createdByUserId: request.auth.userId,
        input,
      });
      response.status(201).json(result);
    } catch (error) { next(error); }
  });

  return router;
}
