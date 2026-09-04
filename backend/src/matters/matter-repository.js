function timestampValue(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function matterFromRow(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    clientRef: row.client_ref,
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
    savedResultIds: Array.isArray(row.saved_result_ids) ? row.saved_result_ids.map(String) : [],
  };
}

export function matterRiskResultFromRow(row) {
  return {
    id: row.id,
    matterId: row.matter_id,
    firmId: row.firm_id,
    createdByUserId: row.created_by_user_id,
    searchResultId: row.search_result_id,
    candidateMarkText: row.candidate_mark_text,
    riskScoreSnapshot: typeof row.risk_score_snapshot === 'string' ? JSON.parse(row.risk_score_snapshot) : row.risk_score_snapshot,
    createdAt: timestampValue(row.created_at),
  };
}

export class MatterRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function') {
      throw new TypeError('MatterRepository needs a PostgreSQL database connection.');
    }
    this.database = database;
  }

  async create({ firmId, createdByUserId, name, clientRef = '' }) {
    const result = await this.database.query(
      `INSERT INTO matters (firm_id, created_by_user_id, name, client_ref)
       VALUES ($1, $2, $3, $4)
       RETURNING id, firm_id, created_by_user_id, name, client_ref, created_at, updated_at`,
      [firmId, createdByUserId || null, name, clientRef],
    );
    return matterFromRow(result.rows[0]);
  }

  async findById({ firmId, id }) {
    const result = await this.database.query(
      `SELECT m.id, m.firm_id, m.created_by_user_id, m.name, m.client_ref, m.created_at, m.updated_at,
              COALESCE(array_agg(r.id) FILTER (WHERE r.id IS NOT NULL), '{}') as saved_result_ids
       FROM matters m
       LEFT JOIN matter_risk_results r ON r.matter_id = m.id
       WHERE m.firm_id = $1 AND m.id = $2
       GROUP BY m.id`,
      [firmId, id],
    );
    if (result.rows.length === 0) return null;
    return matterFromRow(result.rows[0]);
  }

  async listByFirm({ firmId, page = 1, pageSize = 50 }) {
    const offset = (page - 1) * pageSize;
    const countResult = await this.database.query(
      `SELECT COUNT(*)::int AS total FROM matters WHERE firm_id = $1`,
      [firmId],
    );
    const total = countResult.rows[0]?.total ?? 0;

    const result = await this.database.query(
      `SELECT m.id, m.firm_id, m.created_by_user_id, m.name, m.client_ref, m.created_at, m.updated_at,
              COALESCE(array_agg(r.id) FILTER (WHERE r.id IS NOT NULL), '{}') as saved_result_ids
       FROM matters m
       LEFT JOIN matter_risk_results r ON r.matter_id = m.id
       WHERE m.firm_id = $1
       GROUP BY m.id
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [firmId, pageSize, offset],
    );

    return {
      items: result.rows.map(matterFromRow),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async addRiskResult({ firmId, matterId, createdByUserId, searchResultId, candidateMarkText, riskScoreSnapshot }) {
    const result = await this.database.query(
      `INSERT INTO matter_risk_results (matter_id, firm_id, created_by_user_id, search_result_id, candidate_mark_text, risk_score_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, matter_id, firm_id, created_by_user_id, search_result_id, candidate_mark_text, risk_score_snapshot, created_at`,
      [matterId, firmId, createdByUserId || null, searchResultId || null, candidateMarkText, JSON.stringify(riskScoreSnapshot)],
    );
    return matterRiskResultFromRow(result.rows[0]);
  }

  async listRiskResults({ firmId, matterId }) {
    const result = await this.database.query(
      `SELECT id, matter_id, firm_id, created_by_user_id, search_result_id, candidate_mark_text, risk_score_snapshot, created_at
       FROM matter_risk_results
       WHERE firm_id = $1 AND matter_id = $2
       ORDER BY created_at DESC`,
      [firmId, matterId],
    );
    return result.rows.map(matterRiskResultFromRow);
  }
}
