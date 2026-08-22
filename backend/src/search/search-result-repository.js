const COLUMNS = `
  id, firm_id, requested_by_user_id, request_id, query_snapshot, results_snapshot,
  source_statuses, partial, result_count, methodology_versions, created_at`;

function timestamp(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function searchResultFromRow(row) {
  const result = {
    id: row.id,
    firmId: row.firm_id,
    requestedByUserId: row.requested_by_user_id,
    requestId: row.request_id,
    querySnapshot: row.query_snapshot,
    resultsSnapshot: row.results_snapshot,
    sourceStatuses: row.source_statuses,
    partial: row.partial,
    resultCount: row.result_count,
    methodologyVersions: row.methodology_versions,
    createdAt: timestamp(row.created_at),
  };
  if (row.requested_by_actor_user_id !== undefined) {
    result.requestedByActorUserId = row.requested_by_actor_user_id;
  }
  return result;
}

function executor(repository, transaction) {
  return transaction ?? repository.database;
}

export class SearchResultRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function' || typeof database.connect !== 'function') {
      throw new TypeError('SearchResultRepository needs a PostgreSQL pool-like database.');
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
    } finally {
      client.release();
    }
  }

  async insertSnapshot({ transaction, snapshot, actorUserId }) {
    const result = await executor(this, transaction).query(
      `WITH requester AS (
        SELECT id FROM users WHERE firm_id = $2 AND supabase_user_id = $3
      )
      INSERT INTO search_results (
        id, firm_id, requested_by_user_id, request_id, query_snapshot, results_snapshot,
        source_statuses, partial, result_count, methodology_versions, created_at
      ) SELECT $1, $2, requester.id, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, $11
      FROM requester
      ON CONFLICT (firm_id, request_id) DO NOTHING
      RETURNING ${COLUMNS}`,
      [
        snapshot.id, snapshot.firmId, actorUserId, snapshot.requestId,
        JSON.stringify(snapshot.querySnapshot), JSON.stringify(snapshot.resultsSnapshot),
        JSON.stringify(snapshot.sourceStatuses), snapshot.partial, snapshot.resultCount,
        JSON.stringify(snapshot.methodologyVersions), snapshot.createdAt,
      ],
    );
    return result.rowCount ? searchResultFromRow(result.rows[0]) : null;
  }

  async findByIdForFirm({ firmId, id }) {
    const result = await this.database.query(
      `SELECT ${COLUMNS} FROM search_results WHERE firm_id = $1 AND id = $2`,
      [firmId, id],
    );
    return result.rowCount ? searchResultFromRow(result.rows[0]) : null;
  }

  async findByRequestIdForFirm({ firmId, requestId, transaction = null }) {
    const result = await executor(this, transaction).query(
      `SELECT search_results.id, search_results.firm_id, search_results.requested_by_user_id,
              search_results.request_id, search_results.query_snapshot, search_results.results_snapshot,
              search_results.source_statuses, search_results.partial, search_results.result_count,
              search_results.methodology_versions, search_results.created_at,
              users.supabase_user_id AS requested_by_actor_user_id
       FROM search_results
       JOIN users ON users.id = search_results.requested_by_user_id
       WHERE search_results.firm_id = $1 AND search_results.request_id = $2`,
      [firmId, requestId],
    );
    return result.rowCount ? searchResultFromRow(result.rows[0]) : null;
  }

  async listForFirm({ firmId, actorUserId = null, filters, pagination }) {
    const values = [firmId];
    const clauses = ['firm_id = $1'];
    const add = (sql, value) => {
      values.push(value);
      clauses.push(sql.replace('?', `$${values.length}`));
    };
    if (actorUserId) add(
      'requested_by_user_id = (SELECT id FROM users WHERE firm_id = $1 AND supabase_user_id = ?)',
      actorUserId,
    );
    if (filters.requestedByUserId) add('requested_by_user_id = ?', filters.requestedByUserId);
    if (filters.createdFrom) add('created_at >= ?', filters.createdFrom);
    if (filters.createdTo) add('created_at <= ?', filters.createdTo);
    if (filters.partial !== null) add('partial = ?', filters.partial);
    if (pagination.cursor) {
      values.push(pagination.cursor.createdAt);
      values.push(pagination.cursor.id);
      clauses.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(pagination.pageSize + 1);
    const result = await this.database.query(
      `SELECT ${COLUMNS} FROM search_results
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(searchResultFromRow);
  }
}
