import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { parseExportCreate, parseExportId, parseExportListQuery } from '../exports/export-validation.js';

const EXPORT_ROLES = ['admin', 'attorney'];
function validateCreate(request, _response, next) { try { request.exportInput = parseExportCreate(request.body); next(); } catch (error) { next(error); } }
function validateId(request, _response, next) { try { request.exportId = parseExportId(request.params.id); next(); } catch (error) { next(error); } }
function validateList(request, _response, next) { try { parseExportListQuery(request.query); next(); } catch (error) { next(error); } }

export function createExportRouter(authenticate, exportService) {
  if ((typeof authenticate !== 'function' && !Array.isArray(authenticate)) || !exportService) {
    throw new TypeError('createExportRouter needs authentication middleware and an export service.');
  }
  const router = Router();
  router.post('/exports', authenticate, requireRole(EXPORT_ROLES), validateCreate, async (request, response) => {
    const created = await exportService.createExport({
      firmId: request.auth.firmId, actorUserId: request.auth.userId, input: request.exportInput, requestContext: request.auditContext,
    });
    response.status(created.created ? 202 : 200).json(created.export);
  });
  router.get('/exports', authenticate, requireRole(EXPORT_ROLES), validateList,
    async (request, response) => response.json(await exportService.listExports({
      firmId: request.auth.firmId, actorUserId: request.auth.userId, role: request.auth.role, query: request.query,
    })));
  router.get('/exports/:id', authenticate, requireRole(EXPORT_ROLES), validateId,
    async (request, response) => response.json(await exportService.getExport({ firmId: request.auth.firmId, exportId: request.exportId })));
  router.get('/exports/:id/download', authenticate, requireRole(EXPORT_ROLES), validateId,
    async (request, response) => {
      const downloaded = await exportService.download({ firmId: request.auth.firmId, exportId: request.exportId });
      response.set('Content-Type', downloaded.mimeType);
      response.set('Content-Disposition', `attachment; filename="export-${downloaded.id}.pdf"`);
      response.send(downloaded.body);
    });
  return router;
}
