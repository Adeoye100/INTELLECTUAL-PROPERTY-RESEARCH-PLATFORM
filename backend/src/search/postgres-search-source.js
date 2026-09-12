const DEFAULT_MAX_RESULTS = 50;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function push(values, value) {
  values.push(value);
  return `$${values.length}`;
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

    where.push(`(
      lower(mark_text) = lower(${markParam})
      OR mark_text % ${markParam}
      OR to_tsvector('simple', mark_text) @@ plainto_tsquery('simple', ${markParam})
      OR soundex(mark_text) = soundex(${markParam})
    )`);

    const limitParam = push(values, this.maxResults);
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
