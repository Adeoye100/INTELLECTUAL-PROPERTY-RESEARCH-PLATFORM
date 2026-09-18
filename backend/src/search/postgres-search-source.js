const DEFAULT_MAX_RESULTS = 50;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function push(values, value) {
  values.push(value);
  return `$${values.length}`;
}

function strictBoolean(name, fallback = false) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') return fallback;
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false.`);
  }
  return value === 'true';
}

function indexFriendlySearchMode() {
  const configured = process.env.SEARCH_INDEX_FRIENDLY_MODE?.trim();
  if (configured !== undefined && configured !== '') {
    return strictBoolean('SEARCH_INDEX_FRIENDLY_MODE', false);
  }
  return strictBoolean('DEMO_READ_ONLY_MODE', false);
}

function rowToResult(row) {
  return {
    recordId: row.id,
    markText: row.mark_text,
    owner: row.owner ?? null,
    jurisdiction: row.jurisdiction,
    niceClasses: Array.isArray(row.nice_classes) ? row.nice_classes : [],
    status: row.status,
    filingDate: row.filing_date == null ? null : String(row.filing_date).slice(0, 10),
    sourceRegistry: row.source_registry,
    sourceReferenceId: row.source_reference_id,
    relevanceScore: Number(row.relevance_score ?? 0),
  };
}

/**
 * PostgreSQL-backed trademark search using Supabase-compatible primitives:
 * pg_trgm for typo/fuzzy matching, full-text search for word matching, and
 * fuzzystrmatch Soundex for a bounded phonetic candidate path.
 */
export class PostgresSearchSource {
  constructor({ sourceName, database, maxResults = DEFAULT_MAX_RESULTS } = {}) {
    if (!nonEmpty(sourceName)) throw new TypeError('sourceName must be a non-empty string.');
    if (!database || typeof database.query !== 'function') {
      throw new TypeError('PostgresSearchSource requires a database query interface.');
    }
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
      throw new TypeError('maxResults must be an integer from 1 through 100.');
    }
    this.sourceName = sourceName.trim();
    this.database = database;
    this.maxResults = maxResults;
    this.search = this.search.bind(this);
  }

  async search(query = {}) {
    const mark = nonEmpty(query.mark) ? query.mark.trim() : null;
    if (!mark) throw new TypeError('Postgres trademark search requires mark text.');

    const values = [];
    const sourceParam = push(values, this.sourceName);
    const markParam = push(values, mark);
    const where = [`source_registry = ${sourceParam}`];

    if (Array.isArray(query.jurisdictions) && query.jurisdictions.length > 0) {
      const param = push(values, query.jurisdictions);
      where.push(`jurisdiction = ANY(${param}::text[])`);
    }
    if (Array.isArray(query.niceClasses) && query.niceClasses.length > 0) {
      const param = push(values, query.niceClasses);
      where.push(`nice_classes && ${param}::integer[]`);
    }
    if (nonEmpty(query.status)) {
      const param = push(values, query.status.trim());
      where.push(`status = ${param}`);
    }
    if (nonEmpty(query.owner)) {
      const param = push(values, query.owner.trim());
      where.push(`owner IS NOT NULL AND owner ILIKE ('%' || ${param} || '%')`);
    }
    if (nonEmpty(query.filedFrom)) {
      const param = push(values, query.filedFrom.trim());
      where.push(`filing_date >= ${param}::date`);
    }
    if (nonEmpty(query.filedTo)) {
      const param = push(values, query.filedTo.trim());
      where.push(`filing_date <= ${param}::date`);
    }

    const limitParam = push(values, this.maxResults);

    if (indexFriendlySearchMode()) {
      const candidateLimitParam = push(values, Math.min(Math.max(this.maxResults * 4, 100), 400));
      const filters = where.join('\n          AND ');
      const sql = `
        WITH lexical_candidate_ids AS (
          (
            SELECT id
            FROM registry_trademarks
            WHERE ${filters}
              AND lower(mark_text) = lower(${markParam})
            ORDER BY source_updated_at DESC NULLS LAST
            LIMIT ${candidateLimitParam}
          )
          UNION
          (
            SELECT id
            FROM registry_trademarks
            WHERE ${filters}
              AND to_tsvector('simple', mark_text) @@ plainto_tsquery('simple', ${markParam})
            ORDER BY ts_rank_cd(to_tsvector('simple', mark_text), plainto_tsquery('simple', ${markParam})) DESC,
                     source_updated_at DESC NULLS LAST
            LIMIT ${candidateLimitParam}
          )
        ),
        lexical_count AS (
          SELECT count(*)::integer AS value FROM lexical_candidate_ids
        ),
        phonetic_candidate_ids AS (
          SELECT id
          FROM registry_trademarks
          WHERE ${filters}
            AND (SELECT value FROM lexical_count) < ${limitParam}
            AND soundex(mark_text) = soundex(${markParam})
          ORDER BY source_updated_at DESC NULLS LAST
          LIMIT ${candidateLimitParam}
        ),
        fast_candidate_ids AS (
          SELECT id FROM lexical_candidate_ids
          UNION
          SELECT id FROM phonetic_candidate_ids
        ),
        fast_count AS (
          SELECT count(*)::integer AS value FROM fast_candidate_ids
        ),
        fuzzy_candidate_ids AS (
          SELECT id
          FROM registry_trademarks
          WHERE ${filters}
            AND (SELECT value FROM fast_count) < ${limitParam}
            AND mark_text % ${markParam}
          ORDER BY similarity(mark_text, ${markParam}) DESC, source_updated_at DESC NULLS LAST
          LIMIT ${candidateLimitParam}
        ),
        candidate_ids AS (
          SELECT id FROM fast_candidate_ids
          UNION
          SELECT id FROM fuzzy_candidate_ids
        )
        SELECT
          r.id,
          r.mark_text,
          r.owner,
          r.jurisdiction,
          r.nice_classes,
          r.status,
          r.filing_date,
          r.source_registry,
          r.source_reference_id,
          (
            CASE WHEN lower(r.mark_text) = lower(${markParam}) THEN 100 ELSE 0 END
            + (similarity(r.mark_text, ${markParam}) * 60)
            + (ts_rank_cd(to_tsvector('simple', r.mark_text), plainto_tsquery('simple', ${markParam})) * 30)
            + CASE WHEN soundex(r.mark_text) = soundex(${markParam}) THEN 15 ELSE 0 END
          )::double precision AS relevance_score
        FROM candidate_ids c
        JOIN registry_trademarks r ON r.id = c.id
        ORDER BY relevance_score DESC, r.source_updated_at DESC NULLS LAST, r.source_reference_id ASC
        LIMIT ${limitParam}
      `;

      const result = await this.database.query(sql, values);
      return result.rows.map(rowToResult);
    }

    where.push(`(
      lower(mark_text) = lower(${markParam})
      OR mark_text % ${markParam}
      OR to_tsvector('simple', mark_text) @@ plainto_tsquery('simple', ${markParam})
      OR soundex(mark_text) = soundex(${markParam})
    )`);

    const sql = `
      SELECT
        id,
        mark_text,
        owner,
        jurisdiction,
        nice_classes,
        status,
        filing_date,
        source_registry,
        source_reference_id,
        (
          CASE WHEN lower(mark_text) = lower(${markParam}) THEN 100 ELSE 0 END
          + (similarity(mark_text, ${markParam}) * 60)
          + (ts_rank_cd(to_tsvector('simple', mark_text), plainto_tsquery('simple', ${markParam})) * 30)
          + CASE WHEN soundex(mark_text) = soundex(${markParam}) THEN 15 ELSE 0 END
        )::double precision AS relevance_score
      FROM registry_trademarks
      WHERE ${where.join('\n        AND ')}
      ORDER BY relevance_score DESC, source_updated_at DESC NULLS LAST, source_reference_id ASC
      LIMIT ${limitParam}
    `;

    const result = await this.database.query(sql, values);
    return result.rows.map(rowToResult);
  }
}
