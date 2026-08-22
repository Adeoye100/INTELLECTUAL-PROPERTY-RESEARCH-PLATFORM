import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { parseSearchResultListQuery, parseSearchSnapshotId } from '../search/search-result-validation.js';

const READ_ROLES = ['admin', 'attorney', 'viewer'];

function validateId(request, _response, next) {
  try {
    request.searchResultId = parseSearchSnapshotId(request.params.id, 'id');
    next();
  } catch (error) { next(error); }
}

function validateList(request, _response, next) {
  try {
    const parsed = parseSearchResultListQuery(request.query);
    request.searchResultFilters = parsed.filters;
    request.searchResultPagination = parsed.pagination;
    next();
  } catch (error) { next(error); }
}

export function createSearchResultRouter(authenticate, searchResultService) {
  if ((typeof authenticate !== 'function' && !Array.isArray(authenticate)) || !searchResultService) {
    throw new TypeError('createSearchResultRouter needs authentication middleware and a search result service.');
  }
  const router = Router();
  router.get('/search-results', authenticate, requireRole(READ_ROLES), validateList,
    async (request, response) => response.json(await searchResultService.listSearchResults({
      firmId: request.auth.firmId,
      actorUserId: request.auth.userId,
      role: request.auth.role,
      filters: request.searchResultFilters,
      pagination: request.searchResultPagination,
    })));
  router.get('/search-results/:id', authenticate, requireRole(READ_ROLES), validateId,
    async (request, response) => response.json(await searchResultService.getSearchResult({
      firmId: request.auth.firmId,
      searchResultId: request.searchResultId,
    })));
  return router;
}
