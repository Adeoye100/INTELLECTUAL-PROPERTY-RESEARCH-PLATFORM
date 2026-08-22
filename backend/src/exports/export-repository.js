const COLUMNS = `
  id, firm_id, requested_by_user_id, export_type, status, source_entity_id, request_id,
  idempotency_key, parameters, storage_key, mime_type, byte_size, checksum_sha256,
  failure_code, queued_at, processing_started_at, completed_at, failed_at, created_at, updated_at`;

function timestamp(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function exportFromRow(row) {
  const result = {
    id: row.id,
    firmId: row.firm_id,
    requestedByUserId: row.requested_by_user_id,
    type: row.export_type,
    status: row.status,
    sourceEntityId: row.source_entity_id,
    requestId: row.request_id,
    idempotencyKey: row.idempotency_key,
    parameters: row.parameters ?? {},
    storageKey: row.storage_key ?? null,
    mimeType: row.mime_type ?? null,
    byteSize: row.byte_size ?? null,
    checksumSha256: row.checksum_sha256 ?? null,
    failureCode: row.failure_code ?? null,
    queuedAt: timestamp(row.queued_at),
    processingStartedAt: timestamp(row.processing_started_at),
    completedAt: timestamp(row.completed_at),
    failedAt: timestamp(row.failed_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
  if (row.requested_by_actor_user_id !== undefined) result.requestedByActorUserId = row.requested_by_actor_user_id;
  return result;
}

function executor(repository, transaction) { return transaction ?? repository.database; }

export class ExportRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function' || typeof database.connect !== 'function') {
      throw new TypeError('ExportRepository needs a PostgreSQL pool-like database.');
    }
    this.database = database;
  }

  async withTransaction(work) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async insert({ transaction, exportRecord, actorUserId }) {
    const result = await executor(this, transaction).query(
      `WITH requester AS (
        SELECT id FROM users WHERE firm_id = $2 AND supabase_user_id = $3
      )
      INSERT INTO exports (
        id, firm_id, requested_by_user_id, export_type, status, source_entity_id, request_id,
        idempotency_key, parameters, queued_at, created_at, updated_at
      ) SELECT $1, $2, requester.id, $4, 'queued', $5, $6, $7, $8::jsonb, $9, $9, $9
      FROM requester
      ON CONFLICT (firm_id, idempotency_key) DO NOTHING
      RETURNING ${COLUMNS}`,
      [
        exportRecord.id, exportRecord.firmId, actorUserId, exportRecord.type, exportRecord.sourceEntityId,
        exportRecord.requestId, exportRecord.idempotencyKey, JSON.stringify(exportRecord.parameters), exportRecord.queuedAt,
      ],
    );
    return result.rowCount ? exportFromRow(result.rows[0]) : null;
  }

  async findByIdempotencyKeyForFirm({ firmId, idempotencyKey, transaction = null }) {
    const result = await executor(this, transaction).query(
      `SELECT exports.*, users.supabase_user_id AS requested_by_actor_user_id
       FROM exports JOIN users ON users.id = exports.requested_by_user_id
       WHERE exports.firm_id = $1 AND exports.idempotency_key = $2`,
      [firmId, idempotencyKey],
    );
    return result.rowCount ? exportFromRow(result.rows[0]) : null;
  }

  async findByIdForFirm({ firmId, exportId }) {
    const result = await this.database.query(
      `SELECT exports.*, users.supabase_user_id AS requested_by_actor_user_id
       FROM exports JOIN users ON users.id = exports.requested_by_user_id
       WHERE exports.firm_id = $1 AND exports.id = $2`, [firmId, exportId],
    );
    return result.rowCount ? exportFromRow(result.rows[0]) : null;
  }

  async listForFirm({ firmId, actorUserId = null, filters, pagination }) {
    const values = [firmId];
    const clauses = ['exports.firm_id = $1'];
    const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
    if (actorUserId) add('exports.requested_by_user_id = (SELECT id FROM users WHERE firm_id = $1 AND supabase_user_id = ?)', actorUserId);
    if (filters.status) add('exports.status = ?', filters.status);
    if (filters.type) add('exports.export_type = ?', filters.type);
    if (pagination.cursor) {
      values.push(pagination.cursor.createdAt, pagination.cursor.id);
      clauses.push(`(exports.created_at, exports.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(pagination.pageSize + 1);
    const result = await this.database.query(
      `SELECT ${COLUMNS} FROM exports WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(exportFromRow);
  }

  async claimQueued({ transaction, firmId, exportId, processingStartedAt }) {
    const result = await executor(this, transaction).query(
      `UPDATE exports SET status = 'processing', processing_started_at = $3, updated_at = $3
       WHERE firm_id = $1 AND id = $2 AND status = 'queued'
       RETURNING ${COLUMNS}`,
      [firmId, exportId, processingStartedAt],
    );
    return result.rowCount ? exportFromRow(result.rows[0]) : null;
  }

  async complete({ transaction, firmId, exportId, storageKey, byteSize, checksumSha256, completedAt }) {
    const result = await executor(this, transaction).query(
      `UPDATE exports
       SET status = 'completed', storage_key = $3, mime_type = 'application/pdf', byte_size = $4,
         checksum_sha256 = $5, completed_at = $6, updated_at = $6, failure_code = NULL, failed_at = NULL
       WHERE firm_id = $1 AND id = $2 AND status = 'processing'
       RETURNING ${COLUMNS}`,
      [firmId, exportId, storageKey, byteSize, checksumSha256, completedAt],
    );
    return result.rowCount ? exportFromRow(result.rows[0]) : null;
  }

  async requeue({ transaction, firmId, exportId, updatedAt }) {
    const result = await executor(this, transaction).query(
      `UPDATE exports SET status = 'queued', processing_started_at = NULL, updated_at = $3
       WHERE firm_id = $1 AND id = $2 AND status = 'processing'
       RETURNING ${COLUMNS}`,
      [firmId, exportId, updatedAt],
    );
    return result.rowCount ? exportFromRow(result.rows[0]) : null;
  }

  async fail({ transaction, firmId, exportId, failureCode, failedAt }) {
    const result = await executor(this, transaction).query(
      `UPDATE exports
       SET status = 'failed', failure_code = $3, failed_at = $4, completed_at = NULL,
         storage_key = NULL, mime_type = NULL, byte_size = NULL, checksum_sha256 = NULL, updated_at = $4
       WHERE firm_id = $1 AND id = $2 AND status IN ('queued', 'processing')
       RETURNING ${COLUMNS}`,
      [firmId, exportId, failureCode, failedAt],
    );
    return result.rowCount ? exportFromRow(result.rows[0]) : null;
  }
}
