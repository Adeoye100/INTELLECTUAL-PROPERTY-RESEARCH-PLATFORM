import { AppError } from '../errors.js';

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Freshness/readiness boundary for deployments that intentionally search the
 * canonical Supabase/PostgreSQL USPTO mirror without contacting an upstream
 * USPTO API at request time.
 *
 * Search is considered ready when the configured registry has at least one
 * normalized record. The API always returns the corpus' own source date so the
 * UI can accurately state "USPTO data through <date>" instead of implying a
 * real-time upstream API call.
 */
export class PostgresCorpusFreshnessService {
  constructor({ database } = {}) {
    if (!database || typeof database.query !== 'function') {
      throw new TypeError('PostgresCorpusFreshnessService requires a database query interface.');
    }
    this.database = database;
  }

  async getSearchFreshness(sourceRegistry = 'USPTO') {
    const result = await this.database.query(
      `SELECT
         COUNT(*)::bigint AS record_count,
         MAX(source_updated_at) AS data_through,
         MAX(updated_at) AS indexed_at
       FROM registry_trademarks
       WHERE source_registry = $1`,
      [sourceRegistry],
    );
    const row = result.rows?.[0] ?? {};
    const recordCount = Number(row.record_count ?? 0);
    const dataThrough = normalizeDate(row.data_through);
    const indexedAt = normalizeTimestamp(row.indexed_at);

    return {
      source: sourceRegistry,
      status: recordCount > 0 ? 'ready' : 'stale',
      dataThrough,
      indexedAt,
      refreshRunId: null,
      refreshing: false,
      recordCount,
      sourceMode: 'persisted-bulk-corpus',
    };
  }

  async assertSearchReady(sourceRegistry = 'USPTO') {
    const freshness = await this.getSearchFreshness(sourceRegistry);
    if (freshness.status !== 'ready') {
      throw new AppError(
        503,
        'SEARCH_CORPUS_EMPTY',
        'USPTO registry search is temporarily unavailable because the persisted corpus is empty.',
      );
    }
    return freshness;
  }
}
