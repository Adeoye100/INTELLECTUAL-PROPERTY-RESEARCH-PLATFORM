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
       VALUES ($1, (SELECT id FROM users WHERE (id = $2 OR supabase_user_id = $2) AND firm_id = $1 LIMIT 1), $3, $4)
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
       VALUES ($1, $2, (SELECT id FROM users WHERE (id = $3 OR supabase_user_id = $3) AND firm_id = $2 LIMIT 1), $4, $5, $6)
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

  async addOfficeActionRef({ firmId, matterId, officeActionRefId, createdByUserId }) {
    const result = await this.database.query(
      `INSERT INTO matter_office_action_refs (firm_id, matter_id, office_action_ref_id, created_by_user_id)
       VALUES ($1, $2, $3, (SELECT id FROM users WHERE (id = $4 OR supabase_user_id = $4) AND firm_id = $1 LIMIT 1))
       ON CONFLICT (firm_id, matter_id, office_action_ref_id) DO UPDATE SET created_at = matter_office_action_refs.created_at
       RETURNING id, firm_id, matter_id, office_action_ref_id, created_by_user_id, created_at`,
      [firmId, matterId, officeActionRefId, createdByUserId || null],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      firmId: row.firm_id,
      matterId: row.matter_id,
      officeActionRefId: row.office_action_ref_id,
      createdByUserId: row.created_by_user_id,
      createdAt: timestampValue(row.created_at),
    };
  }

  async listOfficeActionRefs({ firmId, matterId }) {
    const result = await this.database.query(
      `SELECT m.id, m.firm_id, m.matter_id, m.office_action_ref_id, m.created_by_user_id, m.created_at,
              r.portfolio_mark_id, r.source_registry, r.source_reference_id, r.application_number,
              r.document_type, r.office_action_date, r.examiner_name, r.examiner_reasoning_summary,
              r.summary_method, r.source_document_url, r.source_metadata
       FROM matter_office_action_refs m
       JOIN office_action_refs r ON r.id = m.office_action_ref_id AND r.firm_id = m.firm_id
       WHERE m.firm_id = $1 AND m.matter_id = $2
       ORDER BY m.created_at DESC`,
      [firmId, matterId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      firmId: row.firm_id,
      matterId: row.matter_id,
      officeActionRefId: row.office_action_ref_id,
      createdByUserId: row.created_by_user_id,
      createdAt: timestampValue(row.created_at),
      officeActionRef: {
        id: row.office_action_ref_id,
        firmId: row.firm_id,
        portfolioMarkId: row.portfolio_mark_id,
        sourceRegistry: row.source_registry,
        sourceReferenceId: row.source_reference_id,
        applicationNumber: row.application_number,
        documentType: row.document_type,
        officeActionDate: row.office_action_date ? (row.office_action_date instanceof Date ? row.office_action_date.toISOString().slice(0, 10) : String(row.office_action_date).slice(0, 10)) : null,
        examinerName: row.examiner_name,
        examinerReasoningSummary: row.examiner_reasoning_summary,
        summaryMethod: row.summary_method,
        sourceDocumentUrl: row.source_document_url,
        sourceMetadata: typeof row.source_metadata === 'object' && row.source_metadata !== null ? row.source_metadata : {},
      },
    }));
  }
}
