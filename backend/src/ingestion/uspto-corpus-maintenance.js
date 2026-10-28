const ACTIVE_USPTO_STATUSES = Object.freeze(['registered', 'pending']);

// These indexes are optional fuzzy-search accelerators once Elasticsearch is
// the live search backend. Keep the exact-match, filter, and projection indexes.
const POSTGRES_SEARCH_INDEXES = Object.freeze([
  'registry_trademarks_mark_text_trgm_idx',
  'registry_trademarks_owner_trgm_idx',
  'registry_trademarks_mark_text_fts_idx',
  'registry_trademarks_nice_classes_gin_idx',
  'registry_trademarks_soundex_idx',
]);

function assertPool(pool) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required.');
}

function sourceName(sourceRegistry) {
  if (typeof sourceRegistry !== 'string' || !/^[A-Z][A-Z0-9_-]{0,31}$/.test(sourceRegistry)) {
    throw new TypeError('sourceRegistry must be an uppercase registry name.');
  }
  return sourceRegistry;
}

export async function getUsptoCorpusPrunePreview({ pool, sourceRegistry = 'USPTO' }) {
  assertPool(pool);
  const source = sourceName(sourceRegistry);
  const [statuses, sizes] = await Promise.all([
    pool.query(`
      SELECT status, COUNT(*)::bigint AS count
      FROM registry_trademarks
      WHERE source_registry = $1
        AND NOT (status = ANY($2::text[]))
      GROUP BY status
      ORDER BY status
    `, [source, ACTIVE_USPTO_STATUSES]),
    pool.query(`
      SELECT
        pg_size_pretty(pg_relation_size('public.registry_trademarks')) AS table_size,
        pg_size_pretty(pg_indexes_size('public.registry_trademarks')) AS index_size,
        pg_size_pretty(pg_total_relation_size('public.registry_trademarks')) AS total_size
    `),
  ]);
  return {
    sourceRegistry: source,
    removableByStatus: (statuses.rows ?? []).map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0),
    })),
    relationSize: {
      tableSize: sizes.rows?.[0]?.table_size ?? null,
      indexSize: sizes.rows?.[0]?.index_size ?? null,
      totalSize: sizes.rows?.[0]?.total_size ?? null,
    },
  };
}

export async function pruneInactiveUsptoRecords({
  pool,
  sourceRegistry = 'USPTO',
  batchSize = 1_000,
  apply = false,
}) {
  assertPool(pool);
  const source = sourceName(sourceRegistry);
  if (apply !== true) {
    throw new Error('Inactive-record pruning requires apply: true.');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
    throw new TypeError('batchSize must be an integer from 1 through 10000.');
  }

  let deleted = 0;
  while (true) {
    const result = await pool.query(`
      WITH victims AS (
        SELECT id
        FROM registry_trademarks
        WHERE source_registry = $1
          AND NOT (status = ANY($2::text[]))
        ORDER BY id
        LIMIT $3
      )
      DELETE FROM registry_trademarks AS trademark
      USING victims
      WHERE trademark.id = victims.id
    `, [source, ACTIVE_USPTO_STATUSES, batchSize]);
    const batchDeleted = Number(result.rowCount ?? 0);
    deleted += batchDeleted;
    if (batchDeleted === 0) break;
  }
  return { sourceRegistry: source, deleted };
}

export async function dropPostgresTrademarkSearchIndexes({ pool }) {
  assertPool(pool);
  for (const indexName of POSTGRES_SEARCH_INDEXES) {
    await pool.query(`DROP INDEX CONCURRENTLY IF EXISTS public.${indexName}`);
  }
  return { dropped: POSTGRES_SEARCH_INDEXES.length, indexes: [...POSTGRES_SEARCH_INDEXES] };
}

export { ACTIVE_USPTO_STATUSES, POSTGRES_SEARCH_INDEXES };
