import { randomUUID } from 'node:crypto';
import { AppError, forbidden } from '../errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit-taxonomy.js';
import { searchExecutionAuditSnapshot } from '../audit/audit-snapshots.js';
import { mapRiskEnrichedSearchResponse } from './search-result-mapper.js';
import {
  cloneSearchSnapshot,
  parseSearchSnapshotId,
  parseSearchSnapshotRequestId,
  validateSearchQuerySnapshot,
  validateSearchSnapshot,
} from './search-result-validation.js';

function scope(value, message) {
  try {
    return parseSearchSnapshotId(value);
  } catch {
    throw forbidden(message);
  }
}

function createdAt(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(500, 'SEARCH_SNAPSHOT_WRITE_FAILED', 'Search snapshot could not be written.');
  }
  return date.toISOString();
}

function methodologyVersions(results) {
  return [...new Set(results.map((result) => result.riskAnalysis.methodology.version))];
}

function comparable(record) {
  return {
    requestId: record.requestId,
    querySnapshot: record.querySnapshot,
    resultsSnapshot: record.resultsSnapshot,
    sourceStatuses: record.sourceStatuses,
    partial: record.partial,
    resultCount: record.resultCount,
    methodologyVersions: record.methodologyVersions,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function equivalent(left, right) {
  return stableJson(comparable(left)) === stableJson(comparable(right));
}

function notFound() {
  return new AppError(404, 'SEARCH_RESULT_NOT_FOUND', 'Search result not found.');
}

function conflict() {
  return new AppError(409, 'SEARCH_SNAPSHOT_CONFLICT', 'This request ID already belongs to a different search snapshot.');
}

function writeFailure(error) {
  if (error instanceof AppError && [
    'SEARCH_SNAPSHOT_INVALID', 'SEARCH_SNAPSHOT_TOO_LARGE', 'SEARCH_SNAPSHOT_PROVENANCE_INVALID',
    'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'SEARCH_SNAPSHOT_CONFLICT',
  ].includes(error.code)) return error;
  return new AppError(500, 'SEARCH_SNAPSHOT_WRITE_FAILED', 'Search snapshot could not be written.');
}

function toApiResponse(record) {
  const snapshot = validateSearchSnapshot(record);
  return {
    searchId: snapshot.id,
    results: cloneSearchSnapshot(snapshot.resultsSnapshot),
    sourceStatuses: cloneSearchSnapshot(snapshot.sourceStatuses),
    partial: snapshot.partial,
    requestId: snapshot.requestId,
  };
}

function toRetrievedResponse(record) {
  const snapshot = validateSearchSnapshot(record);
  return {
    id: snapshot.id,
    requestedByUserId: snapshot.requestedByUserId,
    requestId: snapshot.requestId,
    query: cloneSearchSnapshot(snapshot.querySnapshot),
    results: cloneSearchSnapshot(snapshot.resultsSnapshot),
    sourceStatuses: cloneSearchSnapshot(snapshot.sourceStatuses),
    partial: snapshot.partial,
    resultCount: snapshot.resultCount,
    methodologyVersions: cloneSearchSnapshot(snapshot.methodologyVersions),
    createdAt: snapshot.createdAt,
  };
}

function toListSummary(record) {
  const snapshot = validateSearchSnapshot(record);
  return {
    id: snapshot.id,
    requestedByUserId: snapshot.requestedByUserId,
    requestId: snapshot.requestId,
    query: cloneSearchSnapshot(snapshot.querySnapshot),
    resultCount: snapshot.resultCount,
    partial: snapshot.partial,
    methodologyVersions: cloneSearchSnapshot(snapshot.methodologyVersions),
    createdAt: snapshot.createdAt,
  };
}

/**
 * Stores the exact normalized response once. It never calls Elasticsearch or
 * the risk scorer: those operations complete before this boundary is entered.
 */
export class SearchResultService {
  constructor({ repository, auditService, clock = () => new Date(), idGenerator = randomUUID } = {}) {
    const repositoryMethods = ['withTransaction', 'insertSnapshot', 'findByIdForFirm', 'findByRequestIdForFirm', 'listForFirm'];
    if (!repository || repositoryMethods.some((method) => typeof repository[method] !== 'function')) {
      throw new TypeError('SearchResultService needs an insert/read transaction-capable repository.');
    }
    if (!auditService || typeof auditService.record !== 'function') {
      throw new TypeError('SearchResultService needs an audit service.');
    }
    if (typeof clock !== 'function' || typeof idGenerator !== 'function') {
      throw new TypeError('SearchResultService needs a clock and ID generator.');
    }
    this.repository = repository;
    this.auditService = auditService;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  buildSnapshot({ id, firmId, requestedByUserId, query, searchResponse, createdAt: occurredAt }) {
    const response = mapRiskEnrichedSearchResponse(id, searchResponse);
    return validateSearchSnapshot({
      id,
      firmId,
      requestedByUserId,
      requestId: response.requestId,
      querySnapshot: query,
      resultsSnapshot: response.results,
      sourceStatuses: response.sourceStatuses,
      partial: response.partial,
      resultCount: response.results.length,
      methodologyVersions: methodologyVersions(response.results),
      createdAt: occurredAt,
    });
  }

  async persistSearch({ firmId, requestedByUserId, query, searchResponse, requestContext = null }) {
    const scopedFirmId = scope(firmId, 'A firm membership is required.');
    const scopedActorUserId = scope(requestedByUserId, 'A verified user identity is required.');
    const normalizedQuery = validateSearchQuerySnapshot(query);
    const requestId = parseSearchSnapshotRequestId(searchResponse?.requestId);
    try {
      return await this.repository.withTransaction(async (transaction) => {
        const existing = await this.repository.findByRequestIdForFirm({
          firmId: scopedFirmId, requestId, transaction,
        });
        if (existing) {
          if (existing.requestedByActorUserId && existing.requestedByActorUserId !== scopedActorUserId) throw conflict();
          const proposed = this.buildSnapshot({
            id: existing.id,
            firmId: scopedFirmId,
            requestedByUserId: existing.requestedByUserId,
            query: normalizedQuery,
            searchResponse,
            createdAt: existing.createdAt,
          });
          if (!equivalent(existing, proposed)) throw conflict();
          return { snapshot: toRetrievedResponse(existing), response: toApiResponse(existing), persisted: false };
        }

        const id = parseSearchSnapshotId(this.idGenerator(), 'searchId');
        const snapshot = this.buildSnapshot({
          id,
          firmId: scopedFirmId,
          requestedByUserId: scopedActorUserId,
          query: normalizedQuery,
          searchResponse,
          createdAt: createdAt(this.clock),
        });
        const inserted = await this.repository.insertSnapshot({
          transaction, snapshot, actorUserId: scopedActorUserId,
        });
        if (!inserted) {
          const concurrent = await this.repository.findByRequestIdForFirm({
            firmId: scopedFirmId, requestId, transaction,
          });
          if (!concurrent) throw writeFailure();
          if (concurrent.requestedByActorUserId && concurrent.requestedByActorUserId !== scopedActorUserId) throw conflict();
          const proposed = this.buildSnapshot({
            id: concurrent.id,
            firmId: scopedFirmId,
            requestedByUserId: concurrent.requestedByUserId,
            query: normalizedQuery,
            searchResponse,
            createdAt: concurrent.createdAt,
          });
          if (!equivalent(concurrent, proposed)) throw conflict();
          return { snapshot: toRetrievedResponse(concurrent), response: toApiResponse(concurrent), persisted: false };
        }
        const stored = validateSearchSnapshot(inserted);
        await this.auditService.record({
          transaction,
          requireTransaction: true,
          firmId: scopedFirmId,
          actorUserId: scopedActorUserId,
          action: AUDIT_ACTIONS.SEARCH_EXECUTED,
          entityType: AUDIT_ENTITY_TYPES.SEARCH_RESULT,
          entityId: stored.id,
          beforeState: null,
          afterState: searchExecutionAuditSnapshot({
            searchId: stored.id,
            resultCount: stored.resultCount,
            partial: stored.partial,
            methodologyVersions: stored.methodologyVersions,
          }),
          metadata: {
            respondingSources: stored.sourceStatuses.filter(({ status }) => status === 'complete').map(({ source }) => source),
            unavailableSources: stored.sourceStatuses.filter(({ status }) => status === 'unavailable').map(({ source }) => source),
            jurisdictionCount: stored.querySnapshot.jurisdictions.length,
            niceClassCount: stored.querySnapshot.niceClasses.length,
          },
          requestContext,
        });
        return { snapshot: toRetrievedResponse(stored), response: toApiResponse(stored), persisted: true };
      });
    } catch (error) {
      throw writeFailure(error);
    }
  }

  async getSearchResult({ firmId, searchResultId }) {
    const record = await this.repository.findByIdForFirm({
      firmId: scope(firmId, 'A firm membership is required.'),
      id: parseSearchSnapshotId(searchResultId, 'id'),
    });
    if (!record) throw notFound();
    return toRetrievedResponse(record);
  }

  async listSearchResults({ firmId, actorUserId, role, filters, pagination }) {
    const scopedFirmId = scope(firmId, 'A firm membership is required.');
    const scopedActorUserId = scope(actorUserId, 'A verified user identity is required.');
    if (!['admin', 'attorney', 'viewer'].includes(role)) throw forbidden();
    const records = await this.repository.listForFirm({
      firmId: scopedFirmId,
      actorUserId: role === 'admin' ? null : scopedActorUserId,
      filters,
      pagination,
    });
    const hasMore = records.length > pagination.pageSize;
    const items = records.slice(0, pagination.pageSize).map(toListSummary);
    const last = items.at(-1);
    return {
      searchResults: items,
      nextCursor: hasMore && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url')
        : null,
    };
  }

  async loadSearchSnapshotForExport({ firmId, actorUserId, searchResultId }) {
    scope(actorUserId, 'A verified user identity is required.');
    return this.getSearchResult({ firmId, searchResultId });
  }
}
