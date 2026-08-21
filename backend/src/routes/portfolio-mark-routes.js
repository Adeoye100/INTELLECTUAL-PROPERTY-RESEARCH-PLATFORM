import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import {
  validatePortfolioMarkCreate,
  validatePortfolioMarkId,
  validatePortfolioMarkList,
  validatePortfolioMarkPatch,
} from '../portfolio/portfolio-mark-service.js';

const READ_ROLES = ['admin', 'attorney', 'viewer'];
const WRITE_ROLES = ['admin', 'attorney'];

export function createPortfolioMarkRouter(authenticate, portfolioMarkService) {
  if (typeof authenticate !== 'function' && !Array.isArray(authenticate)) {
    throw new TypeError('createPortfolioMarkRouter needs authentication middleware.');
  }
  if (!portfolioMarkService) throw new TypeError('createPortfolioMarkRouter needs a portfolio mark service.');
  const router = Router();

  router.post('/portfolio-marks', authenticate, requireRole(WRITE_ROLES), validatePortfolioMarkCreate,
    async (request, response) => {
      const portfolioMark = await portfolioMarkService.createPortfolioMark({
        firmId: request.auth.firmId,
        actorUserId: request.auth.userId,
        input: request.portfolioMarkInput,
      });
      response.status(201).json(portfolioMark);
    });
  router.get('/portfolio-marks', authenticate, requireRole(READ_ROLES), validatePortfolioMarkList,
    async (request, response) => {
      response.json(await portfolioMarkService.listPortfolioMarks({
        firmId: request.auth.firmId,
        filters: request.portfolioMarkFilters,
        pagination: request.portfolioMarkPagination,
      }));
    });
  router.get('/portfolio-marks/:id', authenticate, requireRole(READ_ROLES), validatePortfolioMarkId,
    async (request, response) => {
      response.json(await portfolioMarkService.getPortfolioMark({
        firmId: request.auth.firmId, portfolioMarkId: request.portfolioMarkId,
      }));
    });
  router.patch('/portfolio-marks/:id', authenticate, requireRole(WRITE_ROLES), validatePortfolioMarkPatch,
    async (request, response) => {
      response.json(await portfolioMarkService.updatePortfolioMark({
        firmId: request.auth.firmId,
        portfolioMarkId: request.portfolioMarkId,
        input: request.portfolioMarkInput,
      }));
    });
  router.delete('/portfolio-marks/:id', authenticate, requireRole(WRITE_ROLES), validatePortfolioMarkId,
    async (request, response) => {
      await portfolioMarkService.deletePortfolioMark({
        firmId: request.auth.firmId, portfolioMarkId: request.portfolioMarkId,
      });
      response.status(204).end();
    });
  return router;
}
