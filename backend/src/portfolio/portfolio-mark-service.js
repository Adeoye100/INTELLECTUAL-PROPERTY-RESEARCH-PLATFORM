import { conflict, forbidden, AppError } from '../errors.js';
import {
  parsePortfolioMarkCreate,
  parsePortfolioMarkFilters,
  parsePortfolioMarkId,
  parsePortfolioMarkPagination,
  parsePortfolioMarkPatch,
} from './portfolio-mark-validation.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firmScope(firmId) {
  if (typeof firmId !== 'string' || !UUID_PATTERN.test(firmId)) {
    throw forbidden('A firm membership is required.');
  }
  return firmId;
}

function actor(actorUserId) {
  if (typeof actorUserId !== 'string' || !UUID_PATTERN.test(actorUserId)) {
    throw forbidden('A verified user identity is required.');
  }
  return actorUserId;
}

function normalizeDatabaseError(error) {
  if (error?.code === '23505' && error?.constraint === 'portfolio_marks_firm_registry_reference_key') {
    return conflict(
      'PORTFOLIO_MARK_CONFLICT',
      'A portfolio mark with this registry reference already exists for this firm.',
    );
  }
  return error;
}

function notFound() {
  return new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.');
}

export class PortfolioMarkService {
  constructor({ repository }) {
    if (!repository
      || typeof repository.create !== 'function'
      || typeof repository.list !== 'function'
      || typeof repository.get !== 'function'
      || typeof repository.update !== 'function'
      || typeof repository.delete !== 'function') {
      throw new TypeError('PortfolioMarkService needs a portfolio mark repository.');
    }
    this.repository = repository;
  }

  async createPortfolioMark({ firmId, actorUserId, input }) {
    const scopedFirmId = firmScope(firmId);
    const scopedActorUserId = actor(actorUserId);
    const parsed = parsePortfolioMarkCreate(input);
    try {
      return await this.repository.create({ firmId: scopedFirmId, actorUserId: scopedActorUserId, input: parsed });
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async listPortfolioMarks({ firmId, filters, pagination }) {
    const scopedFirmId = firmScope(firmId);
    const parsedFilters = parsePortfolioMarkFilters(filters ?? {});
    const parsedPagination = parsePortfolioMarkPagination(pagination ?? {});
    const result = await this.repository.list({
      firmId: scopedFirmId, filters: parsedFilters, pagination: parsedPagination,
    });
    return {
      items: result.items,
      pagination: {
        page: parsedPagination.page,
        pageSize: parsedPagination.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / parsedPagination.pageSize),
      },
    };
  }

  async getPortfolioMark({ firmId, portfolioMarkId }) {
    const record = await this.repository.get({
      firmId: firmScope(firmId), portfolioMarkId: parsePortfolioMarkId(portfolioMarkId),
    });
    if (!record) throw notFound();
    return record;
  }

  async updatePortfolioMark({ firmId, portfolioMarkId, input }) {
    const scopedFirmId = firmScope(firmId);
    const parsedId = parsePortfolioMarkId(portfolioMarkId);
    const parsed = parsePortfolioMarkPatch(input);
    try {
      const record = await this.repository.update({
        firmId: scopedFirmId, portfolioMarkId: parsedId, input: parsed,
      });
      if (!record) throw notFound();
      return record;
    } catch (error) {
      throw normalizeDatabaseError(error);
    }
  }

  async deletePortfolioMark({ firmId, portfolioMarkId }) {
    const deleted = await this.repository.delete({
      firmId: firmScope(firmId), portfolioMarkId: parsePortfolioMarkId(portfolioMarkId),
    });
    if (!deleted) throw notFound();
  }
}

export function validatePortfolioMarkCreate(request, _response, next) {
  try {
    request.portfolioMarkInput = parsePortfolioMarkCreate(request.body);
    next();
  } catch (error) { next(error); }
}

export function validatePortfolioMarkPatch(request, _response, next) {
  try {
    request.portfolioMarkId = parsePortfolioMarkId(request.params.id);
    request.portfolioMarkInput = parsePortfolioMarkPatch(request.body);
    next();
  } catch (error) { next(error); }
}

export function validatePortfolioMarkId(request, _response, next) {
  try {
    request.portfolioMarkId = parsePortfolioMarkId(request.params.id);
    next();
  } catch (error) { next(error); }
}

export function validatePortfolioMarkList(request, _response, next) {
  try {
    request.portfolioMarkFilters = parsePortfolioMarkFilters(request.query);
    request.portfolioMarkPagination = parsePortfolioMarkPagination(request.query);
    next();
  } catch (error) { next(error); }
}
