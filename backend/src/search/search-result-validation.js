import { AppError, badRequest } from '../errors.js';
import { AUDIT_UUID_PATTERN } from '../audit/audit-service.js';

export const SEARCH_SNAPSHOT_MAX_RESULTS = 100;
export const SEARCH_SNAPSHOT_MAX_BYTES = 256 * 1024;
export const SEARCH_RESULT_LIST_DEFAULT_PAGE_SIZE = 25;
export const SEARCH_RESULT_LIST_MAX_PAGE_SIZE = 100;

const MAX_DEPTH = 12;
const MAX_ARRAY_LENGTH = 100;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RATING_SET = new Set(['low', 'medium', 'high']);
const STATUS_SET = new Set(['complete', 'unavailable']);
const EVIDENCE_TYPES = ['Visual', 'Phonetic', 'Class'];
const QUERY_KEYS = new Set(['mark', 'jurisdictions', 'niceClasses', 'status', 'owner', 'filedFrom', 'filedTo']);
const RESULT_KEYS = new Set([
  'id', 'searchId', 'candidateMarkText', 'candidateSource', 'candidateRef', 'owner', 'jurisdiction',
  'niceClasses', 'filingDate', 'status', 'riskAnalysis',
]);
const RISK_KEYS = new Set([
  'candidateRecordId', 'candidateSource', 'candidateRef', 'phoneticScore', 'visualScore', 'conceptualScore',
  'classOverlap', 'classOverlapScore', 'compositeScore', 'compositeRating', 'methodology', 'matchedMarkRefs',
]);

function snapshotError(code, message) {
  return badRequest(code, message);
}

function assertPlainObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw snapshotError(code, message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw snapshotError(code, message);
}

function assertAllowedKeys(value, allowed, code, message) {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || !allowed.has(key)) throw snapshotError(code, message);
  }
}

function nonEmptyString(value, code, message, maximum = 500) {
  if (typeof value !== 'string') throw snapshotError(code, message);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw snapshotError(code, message);
  return normalized;
}

function nullableString(value, code, message, maximum = 500) {
  if (value === null) return null;
  return nonEmptyString(value, code, message, maximum);
}

function finiteScore(value, code, message, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw snapshotError(code, message);
  }
  return value;
}

function cloneJson(value, code, message, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw snapshotError(code, message);
    return value;
  }
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH) throw snapshotError(code, message);
  if (seen.has(value)) throw snapshotError(code, message);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) throw snapshotError(code, message);
      return value.map((entry) => cloneJson(entry, code, message, seen, depth + 1));
    }
    assertPlainObject(value, code, message);
    const copy = {};
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw snapshotError(code, message);
      copy[key] = cloneJson(nested, code, message, seen, depth + 1);
    }
    return copy;
  } finally {
    seen.delete(value);
  }
}

function date(value, field) {
  if (value === null) return null;
  const normalized = nonEmptyString(value, 'SEARCH_SNAPSHOT_INVALID', `${field} is invalid.`, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', `${field} is invalid.`);
  }
  const [year, month, day] = normalized.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', `${field} is invalid.`);
  }
  return normalized;
}

function isoTimestamp(value, code, message) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw snapshotError(code, message);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw snapshotError(code, message);
  return parsed.toISOString();
}

export function parseSearchSnapshotId(value, field = 'id') {
  if (typeof value !== 'string' || !AUDIT_UUID_PATTERN.test(value)) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', `${field} must be a UUID.`);
  }
  return value;
}

export function parseSearchSnapshotRequestId(value) {
  if (typeof value !== 'string' || !REQUEST_ID_PATTERN.test(value)) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search requestId is invalid.');
  }
  return value;
}

export function validateSearchQuerySnapshot(value) {
  assertPlainObject(value, 'SEARCH_SNAPSHOT_INVALID', 'Search query snapshot is invalid.');
  assertAllowedKeys(value, QUERY_KEYS, 'SEARCH_SNAPSHOT_INVALID', 'Search query snapshot is invalid.');
  const mark = nonEmptyString(value.mark, 'SEARCH_SNAPSHOT_INVALID', 'Search query mark is invalid.', 200);
  if (!Array.isArray(value.jurisdictions) || value.jurisdictions.length > 10) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search query jurisdictions are invalid.');
  }
  const jurisdictions = value.jurisdictions.map((entry) => nonEmptyString(
    entry, 'SEARCH_SNAPSHOT_INVALID', 'Search query jurisdictions are invalid.', 20,
  ));
  if (!Array.isArray(value.niceClasses) || value.niceClasses.length > 45) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search query Nice classes are invalid.');
  }
  const niceClasses = value.niceClasses.map((entry) => {
    if (!Number.isSafeInteger(entry) || entry < 1 || entry > 45) {
      throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search query Nice classes are invalid.');
    }
    return entry;
  });
  const status = value.status === null ? null : nonEmptyString(value.status, 'SEARCH_SNAPSHOT_INVALID', 'Search query status is invalid.', 30);
  const owner = nullableString(value.owner, 'SEARCH_SNAPSHOT_INVALID', 'Search query owner is invalid.', 200);
  const filedFrom = date(value.filedFrom, 'filedFrom');
  const filedTo = date(value.filedTo, 'filedTo');
  if (filedFrom && filedTo && filedFrom > filedTo) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search query date range is invalid.');
  }
  return { mark, jurisdictions, niceClasses, status, owner, filedFrom, filedTo };
}

function validateMethodology(value) {
  assertPlainObject(value, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology is invalid.');
  assertAllowedKeys(value, new Set(['version', 'description', 'sourceAttribution']), 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology is invalid.');
  if (!Array.isArray(value.sourceAttribution) || value.sourceAttribution.length === 0 || value.sourceAttribution.length > 20) {
    throw snapshotError('SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology is invalid.');
  }
  return {
    version: nonEmptyString(value.version, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology is invalid.', 120),
    description: nonEmptyString(value.description, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology is invalid.', 1_000),
    sourceAttribution: value.sourceAttribution.map((entry) => nonEmptyString(
      entry, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology is invalid.', 100,
    )),
  };
}

function validateRiskAnalysis(value, candidate) {
  assertPlainObject(value, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.');
  assertAllowedKeys(value, RISK_KEYS, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.');
  const candidateRecordId = nonEmptyString(value.candidateRecordId, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.', 200);
  const candidateSource = nonEmptyString(value.candidateSource, 'SEARCH_SNAPSHOT_PROVENANCE_INVALID', 'Search candidate provenance is invalid.', 100);
  const candidateRef = nonEmptyString(value.candidateRef, 'SEARCH_SNAPSHOT_PROVENANCE_INVALID', 'Search candidate provenance is invalid.', 200);
  if (candidateSource !== candidate.candidateSource || candidateRef !== candidate.candidateRef) {
    throw snapshotError('SEARCH_SNAPSHOT_PROVENANCE_INVALID', 'Search candidate provenance is inconsistent.');
  }
  if (typeof value.classOverlap !== 'boolean' || !RATING_SET.has(value.compositeRating)) {
    throw snapshotError('SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.');
  }
  if (!Array.isArray(value.matchedMarkRefs) || value.matchedMarkRefs.length !== EVIDENCE_TYPES.length) {
    throw snapshotError('SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.');
  }
  const matchedMarkRefs = value.matchedMarkRefs.map((entry, index) => {
    assertPlainObject(entry, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.');
    assertAllowedKeys(entry, new Set(['type', 'evidence', 'score']), 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.');
    if (entry.type !== EVIDENCE_TYPES[index]) throw snapshotError('SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.');
    return {
      type: entry.type,
      evidence: nonEmptyString(entry.evidence, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.', 1_000),
      score: finiteScore(entry.score, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.'),
    };
  });
  return {
    candidateRecordId,
    candidateSource,
    candidateRef,
    phoneticScore: finiteScore(value.phoneticScore, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.'),
    visualScore: finiteScore(value.visualScore, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.'),
    conceptualScore: finiteScore(value.conceptualScore, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.', { nullable: true }),
    classOverlap: value.classOverlap,
    classOverlapScore: finiteScore(value.classOverlapScore, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.'),
    compositeScore: finiteScore(value.compositeScore, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search risk evidence is invalid.'),
    compositeRating: value.compositeRating,
    methodology: validateMethodology(value.methodology),
    matchedMarkRefs,
  };
}

function validateResult(value, searchId) {
  assertPlainObject(value, 'SEARCH_SNAPSHOT_INVALID', 'Search result is invalid.');
  assertAllowedKeys(value, RESULT_KEYS, 'SEARCH_SNAPSHOT_INVALID', 'Search result is invalid.');
  if (value.searchId !== searchId) throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search result ID is invalid.');
  const candidate = {
    candidateSource: nonEmptyString(value.candidateSource, 'SEARCH_SNAPSHOT_PROVENANCE_INVALID', 'Search candidate provenance is invalid.', 100),
    candidateRef: nonEmptyString(value.candidateRef, 'SEARCH_SNAPSHOT_PROVENANCE_INVALID', 'Search candidate provenance is invalid.', 200),
  };
  if (!Array.isArray(value.niceClasses) || value.niceClasses.length > 45) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search result Nice classes are invalid.');
  }
  return {
    id: nonEmptyString(value.id, 'SEARCH_SNAPSHOT_INVALID', 'Search result ID is invalid.', 200),
    searchId,
    candidateMarkText: nonEmptyString(value.candidateMarkText, 'SEARCH_SNAPSHOT_INVALID', 'Search candidate mark is invalid.', 500),
    candidateSource: candidate.candidateSource,
    candidateRef: candidate.candidateRef,
    owner: nullableString(value.owner, 'SEARCH_SNAPSHOT_INVALID', 'Search candidate owner is invalid.', 500),
    jurisdiction: nonEmptyString(value.jurisdiction, 'SEARCH_SNAPSHOT_INVALID', 'Search candidate jurisdiction is invalid.', 20),
    niceClasses: value.niceClasses.map((entry) => {
      if (!Number.isSafeInteger(entry) || entry < 1 || entry > 45) {
        throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search result Nice classes are invalid.');
      }
      return entry;
    }),
    filingDate: date(value.filingDate, 'filingDate'),
    status: nonEmptyString(value.status, 'SEARCH_SNAPSHOT_INVALID', 'Search candidate status is invalid.', 30),
    riskAnalysis: validateRiskAnalysis(value.riskAnalysis, candidate),
  };
}

export function validateSearchSnapshot({
  id, firmId, requestedByUserId, requestId, querySnapshot, resultsSnapshot,
  sourceStatuses, partial, resultCount, methodologyVersions, createdAt,
}) {
  const snapshotId = parseSearchSnapshotId(id, 'searchId');
  const scopedFirmId = parseSearchSnapshotId(firmId, 'firmId');
  const scopedRequestedByUserId = parseSearchSnapshotId(requestedByUserId, 'requestedByUserId');
  const normalizedRequestId = parseSearchSnapshotRequestId(requestId);
  const query = validateSearchQuerySnapshot(querySnapshot);
  if (!Array.isArray(resultsSnapshot) || resultsSnapshot.length > SEARCH_SNAPSHOT_MAX_RESULTS) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search results snapshot is invalid.');
  }
  const results = resultsSnapshot.map((entry) => validateResult(entry, snapshotId));
  if (!Number.isSafeInteger(resultCount) || resultCount < 0 || resultCount !== results.length) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search result count is invalid.');
  }
  if (!Array.isArray(sourceStatuses) || sourceStatuses.length > 20) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search source statuses are invalid.');
  }
  const statuses = sourceStatuses.map((entry) => {
    assertPlainObject(entry, 'SEARCH_SNAPSHOT_INVALID', 'Search source status is invalid.');
    assertAllowedKeys(entry, new Set(['source', 'status', 'resultCount']), 'SEARCH_SNAPSHOT_INVALID', 'Search source status is invalid.');
    if (!STATUS_SET.has(entry.status) || !Number.isSafeInteger(entry.resultCount) || entry.resultCount < 0 || entry.resultCount > SEARCH_SNAPSHOT_MAX_RESULTS) {
      throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search source status is invalid.');
    }
    return {
      source: nonEmptyString(entry.source, 'SEARCH_SNAPSHOT_INVALID', 'Search source status is invalid.', 100),
      status: entry.status,
      resultCount: entry.resultCount,
    };
  });
  if (typeof partial !== 'boolean') throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search partial state is invalid.');
  if (!Array.isArray(methodologyVersions) || methodologyVersions.length > SEARCH_SNAPSHOT_MAX_RESULTS) {
    throw snapshotError('SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology versions are invalid.');
  }
  const versions = methodologyVersions.map((entry) => nonEmptyString(
    entry, 'SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology versions are invalid.', 120,
  ));
  const derivedVersions = [...new Set(results.map((entry) => entry.riskAnalysis.methodology.version))];
  if (JSON.stringify(versions) !== JSON.stringify(derivedVersions)) {
    throw snapshotError('SEARCH_SNAPSHOT_RISK_EVIDENCE_INVALID', 'Search methodology versions are inconsistent.');
  }
  const normalizedCreatedAt = isoTimestamp(createdAt, 'SEARCH_SNAPSHOT_INVALID', 'Search createdAt is invalid.');
  const snapshot = {
    id: snapshotId,
    firmId: scopedFirmId,
    requestedByUserId: scopedRequestedByUserId,
    requestId: normalizedRequestId,
    querySnapshot: query,
    resultsSnapshot: results,
    sourceStatuses: statuses,
    partial,
    resultCount,
    methodologyVersions: versions,
    createdAt: normalizedCreatedAt,
  };
  let serialized;
  try { serialized = JSON.stringify(snapshot); } catch { throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search snapshot is invalid.'); }
  if (Buffer.byteLength(serialized, 'utf8') > SEARCH_SNAPSHOT_MAX_BYTES) {
    throw snapshotError('SEARCH_SNAPSHOT_TOO_LARGE', 'Search snapshot is too large.');
  }
  return snapshot;
}

function parseOptionalUuid(value, field) {
  if (value === undefined) return null;
  return parseSearchSnapshotId(value, field);
}

function parseOptionalTimestamp(value, field) {
  if (value === undefined) return null;
  return isoTimestamp(value, 'SEARCH_SNAPSHOT_INVALID', `${field} is invalid.`);
}

export function parseSearchResultListQuery(query) {
  assertPlainObject(query, 'SEARCH_SNAPSHOT_INVALID', 'Search result query is invalid.');
  const allowed = new Set(['requestedByUserId', 'createdFrom', 'createdTo', 'partial', 'pageSize', 'cursor']);
  assertAllowedKeys(query, allowed, 'SEARCH_SNAPSHOT_INVALID', 'Search result query is invalid.');
  const requestedByUserId = parseOptionalUuid(query.requestedByUserId, 'requestedByUserId');
  const createdFrom = parseOptionalTimestamp(query.createdFrom, 'createdFrom');
  const createdTo = parseOptionalTimestamp(query.createdTo, 'createdTo');
  if (createdFrom && createdTo && createdFrom > createdTo) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'Search result date range is invalid.');
  }
  let partial = null;
  if (query.partial !== undefined) {
    if (query.partial !== 'true' && query.partial !== 'false') {
      throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'partial must be true or false.');
    }
    partial = query.partial === 'true';
  }
  const rawPageSize = query.pageSize === undefined ? String(SEARCH_RESULT_LIST_DEFAULT_PAGE_SIZE) : query.pageSize;
  if (typeof rawPageSize !== 'string' || !/^\d+$/.test(rawPageSize)) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'pageSize is invalid.');
  }
  const pageSize = Number(rawPageSize);
  if (pageSize < 1 || pageSize > SEARCH_RESULT_LIST_MAX_PAGE_SIZE) {
    throw snapshotError('SEARCH_SNAPSHOT_INVALID', 'pageSize is invalid.');
  }
  let cursor = null;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || query.cursor.length > 500) {
      throw snapshotError('SEARCH_SNAPSHOT_CURSOR_INVALID', 'Search result cursor is invalid.');
    }
    try {
      const parsed = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      assertPlainObject(parsed, 'SEARCH_SNAPSHOT_CURSOR_INVALID', 'Search result cursor is invalid.');
      cursor = {
        createdAt: isoTimestamp(parsed.createdAt, 'SEARCH_SNAPSHOT_CURSOR_INVALID', 'Search result cursor is invalid.'),
        id: parseSearchSnapshotId(parsed.id, 'cursor.id'),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw snapshotError('SEARCH_SNAPSHOT_CURSOR_INVALID', 'Search result cursor is invalid.');
    }
  }
  return {
    filters: { requestedByUserId, createdFrom, createdTo, partial },
    pagination: { pageSize, cursor },
  };
}

export function cloneSearchSnapshot(value) {
  return cloneJson(value, 'SEARCH_SNAPSHOT_INVALID', 'Search snapshot is invalid.');
}
