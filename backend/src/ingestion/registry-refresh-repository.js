function formatDateOnly(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val).slice(0, 10);
}

function refreshRunFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceRegistry: row.source_registry,
    status: row.status,
    requestedSinceDate: formatDateOnly(row.requested_since_date),
    latestDiscoveredSourceDate: formatDateOnly(row.latest_discovered_source_date),
    dataThroughDate: formatDateOnly(row.data_through_date),
    discoveredFileCount: Number(row.discovered_file_count ?? 0),
    processedRecordCount: Number(row.processed_record_count ?? 0),
    changedRecordCount: Number(row.changed_record_count ?? 0),
    projectedRecordCount: Number(row.projected_record_count ?? 0),
    projectionBacklogCount: row.projection_backlog_count !== null && row.projection_backlog_count !== undefined
      ? Number(row.projection_backlog_count)
      : null,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    ingestionCompletedAt: row.ingestion_completed_at ? new Date(row.ingestion_completed_at).toISOString() : null,
    projectionCompletedAt: row.projection_completed_at ? new Date(row.projection_completed_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    errorCode: row.error_code ?? null,
  };
}

const SELECT_COLUMNS = `
  id, source_registry, status, requested_since_date, latest_discovered_source_date,
  data_through_date, discovered_file_count, processed_record_count, changed_record_count,
  projected_record_count, projection_backlog_count, started_at, ingestion_completed_at,
  projection_completed_at, completed_at, error_code
`;

export class RegistryRefreshRepository {
  constructor(pool) {
    if (!pool || typeof pool.query !== 'function') {
      throw new TypeError('RegistryRefreshRepository needs a database pool.');
    }
    this.pool = pool;
  }

  async startRun({ sourceRegistry, requestedSinceDate }) {
    if (typeof sourceRegistry !== 'string' || !sourceRegistry.trim()) {
      throw new TypeError('startRun requires a sourceRegistry string.');
    }
    const result = await this.pool.query(
      `INSERT INTO registry_refresh_runs (source_registry, status, requested_since_date, started_at)
       VALUES ($1, 'running', $2, now())
       RETURNING ${SELECT_COLUMNS}`,
      [sourceRegistry.trim(), requestedSinceDate ?? null],
    );
    return refreshRunFromRow(result.rows[0]);
  }

  async markIngested({
    runId,
    latestDiscoveredSourceDate,
    discoveredFileCount,
    processedRecordCount,
    changedRecordCount,
  }) {
    if (!runId) throw new TypeError('markIngested requires a runId.');
    const result = await this.pool.query(
      `UPDATE registry_refresh_runs
       SET status = 'ingested',
           latest_discovered_source_date = $2,
           discovered_file_count = $3,
           processed_record_count = $4,
           changed_record_count = $5,
           ingestion_completed_at = now()
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [
        runId,
        latestDiscoveredSourceDate ?? null,
        Math.max(0, discoveredFileCount ?? 0),
        Math.max(0, processedRecordCount ?? 0),
        Math.max(0, changedRecordCount ?? 0),
      ],
    );
    return refreshRunFromRow(result.rows[0]);
  }

  async markComplete({
    runId,
    dataThroughDate,
    projectedRecordCount,
    projectionBacklogCount,
  }) {
    if (!runId) throw new TypeError('markComplete requires a runId.');
    const result = await this.pool.query(
      `UPDATE registry_refresh_runs
       SET status = 'complete',
           data_through_date = $2,
           projected_record_count = $3,
           projection_backlog_count = $4,
           projection_completed_at = now(),
           completed_at = now()
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [
        runId,
        dataThroughDate ?? null,
        Math.max(0, projectedRecordCount ?? 0),
        projectionBacklogCount ?? 0,
      ],
    );
    return refreshRunFromRow(result.rows[0]);
  }

  async markFailed({ runId, errorCode }) {
    if (!runId) throw new TypeError('markFailed requires a runId.');
    const safeErrorCode = typeof errorCode === 'string' && /^[A-Z0-9_]{1,100}$/.test(errorCode)
      ? errorCode
      : 'UNKNOWN_REFRESH_ERROR';
    const result = await this.pool.query(
      `UPDATE registry_refresh_runs
       SET status = 'failed',
           error_code = $2,
           completed_at = now()
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [runId, safeErrorCode],
    );
    return refreshRunFromRow(result.rows[0]);
  }

  async latestCompleteRun(sourceRegistry) {
    if (typeof sourceRegistry !== 'string' || !sourceRegistry.trim()) {
      throw new TypeError('latestCompleteRun requires a sourceRegistry string.');
    }
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM registry_refresh_runs
       WHERE source_registry = $1 AND status = 'complete'
       ORDER BY completed_at DESC
       LIMIT 1`,
      [sourceRegistry.trim()],
    );
    return result.rowCount ? refreshRunFromRow(result.rows[0]) : null;
  }

  async latestRun(sourceRegistry) {
    if (typeof sourceRegistry !== 'string' || !sourceRegistry.trim()) {
      throw new TypeError('latestRun requires a sourceRegistry string.');
    }
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM registry_refresh_runs
       WHERE source_registry = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [sourceRegistry.trim()],
    );
    return result.rowCount ? refreshRunFromRow(result.rows[0]) : null;
  }
}
