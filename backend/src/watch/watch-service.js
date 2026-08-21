import { AppError, conflict, forbidden } from '../errors.js';
import {
  parseWatchCreate, parseWatchFilters, parseWatchId, parseWatchPagination, parseWatchPatch, UUID_PATTERN,
} from './watch-validation.js';

function scopedFirm(firmId) {
  if (typeof firmId !== 'string' || !UUID_PATTERN.test(firmId)) throw forbidden('A firm membership is required.');
  return firmId;
}

function scopedActor(actorUserId) {
  if (typeof actorUserId !== 'string' || !UUID_PATTERN.test(actorUserId)) {
    throw forbidden('A verified user identity is required.');
  }
  return actorUserId;
}

const watchNotFound = () => new AppError(404, 'WATCH_NOT_FOUND', 'Watch not found.');
const markNotFound = () => new AppError(404, 'PORTFOLIO_MARK_NOT_FOUND', 'Portfolio mark not found.');

function normalizeDatabaseError(error) {
  if (error?.code === '23505' && error?.constraint === 'watches_one_enabled_per_mark_uidx') {
    return conflict('WATCH_CONFLICT', 'An enabled watch already exists for this portfolio mark.');
  }
  if (error?.code === '23503' && error?.constraint === 'watches_portfolio_mark_firm_key') return markNotFound();
  return error;
}

function nowIso(clock) {
  const now = clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('Watch clock must return a valid Date.');
  return now.toISOString();
}

export class WatchService {
  constructor({ repository, defaultPollIntervalMinutes, clock = () => new Date() }) {
    if (!repository || ['portfolioMarkExists', 'create', 'list', 'get', 'update', 'delete'].some(
      (method) => typeof repository[method] !== 'function',
    )) throw new TypeError('WatchService needs a watch repository.');
    if (!Number.isSafeInteger(defaultPollIntervalMinutes) || defaultPollIntervalMinutes < 5 || defaultPollIntervalMinutes > 43_200) {
      throw new TypeError('WatchService needs a valid default polling interval.');
    }
    if (typeof clock !== 'function') throw new TypeError('WatchService needs a clock.');
    this.repository = repository;
    this.defaultPollIntervalMinutes = defaultPollIntervalMinutes;
    this.clock = clock;
  }

  async createWatch({ firmId, actorUserId, input }) {
    const scopedFirmId = scopedFirm(firmId);
    const parsed = parseWatchCreate(input, this.defaultPollIntervalMinutes);
    if (!await this.repository.portfolioMarkExists({ firmId: scopedFirmId, portfolioMarkId: parsed.portfolioMarkId })) {
      throw markNotFound();
    }
    try {
      return await this.repository.create({
        firmId: scopedFirmId,
        actorUserId: scopedActor(actorUserId),
        input: parsed,
        nextPollAt: parsed.state === 'enabled' ? nowIso(this.clock) : null,
      });
    } catch (error) { throw normalizeDatabaseError(error); }
  }

  async listWatches({ firmId, filters, pagination }) {
    const parsedPagination = parseWatchPagination(pagination ?? {});
    const result = await this.repository.list({
      firmId: scopedFirm(firmId), filters: parseWatchFilters(filters ?? {}), pagination: parsedPagination,
    });
    return {
      items: result.items,
      pagination: {
        page: parsedPagination.page, pageSize: parsedPagination.pageSize, total: result.total,
        totalPages: Math.ceil(result.total / parsedPagination.pageSize),
      },
    };
  }

  async getWatch({ firmId, watchId }) {
    const watch = await this.repository.get({ firmId: scopedFirm(firmId), watchId: parseWatchId(watchId) });
    if (!watch) throw watchNotFound();
    return watch;
  }

  async updateWatch({ firmId, watchId, input }) {
    const parsed = parseWatchPatch(input);
    if (parsed.state === 'enabled') parsed.nextPollAt = nowIso(this.clock);
    if (parsed.state === 'paused') parsed.nextPollAt = null;
    try {
      const watch = await this.repository.update({
        firmId: scopedFirm(firmId), watchId: parseWatchId(watchId), input: parsed,
      });
      if (!watch) throw watchNotFound();
      return watch;
    } catch (error) { throw normalizeDatabaseError(error); }
  }

  async deleteWatch({ firmId, watchId }) {
    if (!await this.repository.delete({ firmId: scopedFirm(firmId), watchId: parseWatchId(watchId) })) {
      throw watchNotFound();
    }
  }
}

function validation(middleware) {
  return (request, _response, next) => {
    try { middleware(request); next(); } catch (error) { next(error); }
  };
}

export function createValidateWatchCreate(defaultPollIntervalMinutes) {
  return validation((request) => {
    request.watchInput = parseWatchCreate(request.body, defaultPollIntervalMinutes);
  });
}
export const validateWatchPatch = validation((request) => {
  request.watchId = parseWatchId(request.params.id);
  request.watchInput = parseWatchPatch(request.body);
});
export const validateWatchId = validation((request) => { request.watchId = parseWatchId(request.params.id); });
export const validateWatchList = validation((request) => {
  request.watchFilters = parseWatchFilters(request.query);
  request.watchPagination = parseWatchPagination(request.query);
});
