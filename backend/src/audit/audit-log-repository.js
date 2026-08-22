const COLUMNS = `
  id, firm_id, actor_user_id, action, entity_type, entity_id, before_state, after_state,
  metadata, request_id, ip_address, user_agent, occurred_at, created_at`;

function timestamp(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function auditLogFromRow(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeState: row.before_state,
    afterState: row.after_state,
    metadata: row.metadata,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    occurredAt: timestamp(row.occurred_at),
    createdAt: timestamp(row.created_at),
  };
}

function executor(repository, transaction) {
  return transaction ?? repository.database;
}

export class AuditLogRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function') {
      throw new TypeError('AuditLogRepository needs a PostgreSQL query-capable database.');
    }
    this.database = database;
  }

  async insert({
    transaction = null, id, firmId, actorUserId, action, entityType, entityId,
    beforeState, afterState, metadata, requestContext, occurredAt,
  }) {
    const result = await executor(this, transaction).query(
      `WITH actor AS (
        SELECT id FROM users WHERE firm_id = $2 AND supabase_user_id = $3
      )
      INSERT INTO audit_logs (
        id, firm_id, actor_user_id, action, entity_type, entity_id, before_state, after_state,
        metadata, request_id, ip_address, user_agent, occurred_at
      ) SELECT $1, $2, actor.id, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb,
               $10, $11, $12, $13
      FROM actor
      RETURNING ${COLUMNS}`,
      [
        id, firmId, actorUserId, action, entityType, entityId,
        beforeState === null ? null : JSON.stringify(beforeState),
        afterState === null ? null : JSON.stringify(afterState), JSON.stringify(metadata),
        requestContext.requestId, requestContext.ipAddress, requestContext.userAgent, occurredAt,
      ],
    );
    return result.rowCount ? auditLogFromRow(result.rows[0]) : null;
  }

  async list({ firmId, filters, pagination }) {
    const values = [firmId];
    const clauses = ['firm_id = $1'];
    const add = (sql, value) => {
      values.push(value);
      clauses.push(sql.replace('?', `$${values.length}`));
    };
    if (filters.actorUserId) add('actor_user_id = ?', filters.actorUserId);
    if (filters.action) add('action = ?', filters.action);
    if (filters.entityType) add('entity_type = ?', filters.entityType);
    if (filters.entityId) add('entity_id = ?', filters.entityId);
    if (filters.occurredFrom) add('occurred_at >= ?', filters.occurredFrom);
    if (filters.occurredTo) add('occurred_at <= ?', filters.occurredTo);
    if (pagination.cursor) {
      values.push(pagination.cursor.occurredAt);
      values.push(pagination.cursor.id);
      clauses.push(`(occurred_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(pagination.pageSize + 1);
    const result = await this.database.query(
      `SELECT ${COLUMNS} FROM audit_logs
       WHERE ${clauses.join(' AND ')}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(auditLogFromRow);
  }

  async findById({ firmId, auditLogId }) {
    const result = await this.database.query(
      `SELECT ${COLUMNS} FROM audit_logs WHERE firm_id = $1 AND id = $2`,
      [firmId, auditLogId],
    );
    return result.rowCount ? auditLogFromRow(result.rows[0]) : null;
  }
}
