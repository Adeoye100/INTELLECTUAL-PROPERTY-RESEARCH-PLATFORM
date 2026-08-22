import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import {
  parseOfficeActionRefCreate,
  parseOfficeActionRefId,
  parseOfficeActionRefPagination,
  parseOfficeActionRefPatch,
  parseOfficeActionSearchQuery,
} from '../office-actions/office-action-validation.js';

const READ_ROLES = ['admin', 'attorney', 'viewer'];
const WRITE_ROLES = ['admin', 'attorney'];

function validAuthentication(authentication) {
  return typeof authentication === 'function'
    || (Array.isArray(authentication) && authentication.length > 0
      && authentication.every((middleware) => typeof middleware === 'function'));
}

function validateSearch(maximumResults) {
  return (request, _response, next) => {
    try {
      request.officeActionSearchQuery = parseOfficeActionSearchQuery(request.query, { maximumResults });
      next();
    } catch (error) { next(error); }
  };
}

function validatePortfolioMark(request, _response, next) {
  try {
    request.officeActionPortfolioMarkId = parseOfficeActionRefId(request.params.portfolioMarkId, 'portfolioMarkId');
    next();
  } catch (error) { next(error); }
}

function validateOfficeActionRef(request, _response, next) {
  try {
    request.officeActionPortfolioMarkId = parseOfficeActionRefId(request.params.portfolioMarkId, 'portfolioMarkId');
    request.officeActionRefId = parseOfficeActionRefId(request.params.id);
    next();
  } catch (error) { next(error); }
}

function validateCreate(request, _response, next) {
  try {
    request.officeActionPortfolioMarkId = parseOfficeActionRefId(request.params.portfolioMarkId, 'portfolioMarkId');
    request.officeActionRefInput = parseOfficeActionRefCreate(request.body);
    next();
  } catch (error) { next(error); }
}

function validatePatch(request, _response, next) {
  try {
    request.officeActionPortfolioMarkId = parseOfficeActionRefId(request.params.portfolioMarkId, 'portfolioMarkId');
    request.officeActionRefId = parseOfficeActionRefId(request.params.id);
    request.officeActionRefInput = parseOfficeActionRefPatch(request.body);
    next();
  } catch (error) { next(error); }
}

function validateList(request, _response, next) {
  try {
    request.officeActionPortfolioMarkId = parseOfficeActionRefId(request.params.portfolioMarkId, 'portfolioMarkId');
    request.officeActionRefPagination = parseOfficeActionRefPagination(request.query);
    next();
  } catch (error) { next(error); }
}

function apiSearchResult(record) {
  return {
    sourceRegistry: record.sourceRegistry,
    sourceReferenceId: record.sourceReferenceId,
    applicationNumber: record.applicationNumber,
    markText: record.markText,
    owner: record.owner,
    jurisdiction: record.jurisdiction,
    documentType: record.documentType,
    officeActionDate: record.officeActionDate,
    examinerName: record.examinerName,
    examinerReasoningSummary: record.examinerReasoningSummary,
    summaryMethod: record.summaryMethod,
    sourceDocumentUrl: record.sourceDocumentUrl,
    sourceMetadata: record.sourceMetadata,
  };
}

export function createOfficeActionSearchRouter(authenticate, officeActionSearchService, { maximumResults = 25 } = {}) {
  if (!validAuthentication(authenticate)) throw new TypeError('createOfficeActionSearchRouter needs authentication middleware.');
  if (!officeActionSearchService || typeof officeActionSearchService.searchOfficeActions !== 'function') {
    throw new TypeError('createOfficeActionSearchRouter needs an Office Action search service.');
  }
  const router = Router();
  router.get(
    '/office-actions/search',
    authenticate,
    requireRole(READ_ROLES),
    validateSearch(maximumResults),
    async (request, response) => {
      const searched = await officeActionSearchService.searchOfficeActions(request.officeActionSearchQuery);
      response.json({
        results: searched.results.map(apiSearchResult),
        sourceStatuses: searched.sourceStatuses,
        partial: searched.partial,
        requestId: searched.requestId,
      });
    },
  );
  return router;
}

export function createOfficeActionRefRouter(authenticate, officeActionRefService) {
  if (!validAuthentication(authenticate) || !officeActionRefService) {
    throw new TypeError('createOfficeActionRefRouter needs authentication middleware and an Office Action reference service.');
  }
  const router = Router();
  const base = '/portfolio-marks/:portfolioMarkId/office-action-refs';

  router.post(base, authenticate, requireRole(WRITE_ROLES), validateCreate, async (request, response) => {
    const record = await officeActionRefService.createOfficeActionRef({
      firmId: request.auth.firmId, actorUserId: request.auth.userId,
      portfolioMarkId: request.officeActionPortfolioMarkId, input: request.officeActionRefInput,
      requestContext: request.auditContext,
    });
    response.status(201).json(record);
  });
  router.get(base, authenticate, requireRole(READ_ROLES), validateList, async (request, response) => {
    response.json(await officeActionRefService.listOfficeActionRefs({
      firmId: request.auth.firmId, portfolioMarkId: request.officeActionPortfolioMarkId,
      pagination: request.officeActionRefPagination,
    }));
  });
  router.get(`${base}/:id`, authenticate, requireRole(READ_ROLES), validateOfficeActionRef, async (request, response) => {
    response.json(await officeActionRefService.getOfficeActionRef({
      firmId: request.auth.firmId, portfolioMarkId: request.officeActionPortfolioMarkId,
      officeActionRefId: request.officeActionRefId,
    }));
  });
  router.patch(`${base}/:id`, authenticate, requireRole(WRITE_ROLES), validatePatch, async (request, response) => {
    response.json(await officeActionRefService.updateOfficeActionRef({
      firmId: request.auth.firmId, actorUserId: request.auth.userId,
      portfolioMarkId: request.officeActionPortfolioMarkId, officeActionRefId: request.officeActionRefId,
      input: request.officeActionRefInput, requestContext: request.auditContext,
    }));
  });
  router.delete(`${base}/:id`, authenticate, requireRole(WRITE_ROLES), validateOfficeActionRef, async (request, response) => {
    await officeActionRefService.deleteOfficeActionRef({
      firmId: request.auth.firmId, actorUserId: request.auth.userId,
      portfolioMarkId: request.officeActionPortfolioMarkId, officeActionRefId: request.officeActionRefId,
      requestContext: request.auditContext,
    });
    response.status(204).end();
  });
  return router;
}
