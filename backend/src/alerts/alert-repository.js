const RISK_COLUMNS = `
  id, firm_id, watch_id, portfolio_mark_id, candidate_source, candidate_registry_reference,
  candidate_mark_text, visual_score, phonetic_score, class_overlap_score, composite_score,
  conceptual_score, composite_rating, methodology_version, matched_mark_refs, source_request_id,
  source_statuses, source_partial, observed_at, fingerprint, created_at`;
const ALERT_COLUMNS = `
  id, firm_id, watch_id, portfolio_mark_id, risk_score_id, severity, status, policy_version,
  created_at, read_at, dismissed_at, updated_at`;

function time(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function number(value) { return value === null || value === undefined ? null : Number(value); }

export function riskScoreFromRow(row) {
  return {
    id: row.id, firmId: row.firm_id, watchId: row.watch_id, portfolioMarkId: row.portfolio_mark_id,
    candidateSource: row.candidate_source, candidateRegistryReference: row.candidate_registry_reference,
    candidateMarkText: row.candidate_mark_text, visualScore: number(row.visual_score),
    phoneticScore: number(row.phonetic_score), classOverlapScore: number(row.class_overlap_score),
    compositeScore: number(row.composite_score), conceptualScore: number(row.conceptual_score),
    compositeRating: row.composite_rating, methodologyVersion: row.methodology_version,
    matchedMarkRefs: row.matched_mark_refs, sourceRequestId: row.source_request_id,
    sourceStatuses: row.source_statuses, sourcePartial: row.source_partial,
    observedAt: time(row.observed_at), createdAt: time(row.created_at),
  };
}

function alertFromRow(row) {
  return {
    id: row.id, firmId: row.firm_id, watchId: row.watch_id, portfolioMarkId: row.portfolio_mark_id,
    riskScoreId: row.risk_score_id, severity: row.severity, status: row.status,
    policyVersion: row.policy_version, createdAt: time(row.created_at), readAt: time(row.read_at),
    dismissedAt: time(row.dismissed_at), updatedAt: time(row.updated_at),
  };
}

function alertWithRisk(row) {
  return {
    ...alertFromRow(row),
    riskScore: riskScoreFromRow({
      id: row.risk_id, firm_id: row.firm_id, watch_id: row.risk_watch_id,
      portfolio_mark_id: row.risk_portfolio_mark_id, candidate_source: row.candidate_source,
      candidate_registry_reference: row.candidate_registry_reference, candidate_mark_text: row.candidate_mark_text,
      visual_score: row.visual_score, phonetic_score: row.phonetic_score,
      class_overlap_score: row.class_overlap_score, composite_score: row.composite_score,
      conceptual_score: row.conceptual_score, composite_rating: row.composite_rating,
      methodology_version: row.methodology_version, matched_mark_refs: row.matched_mark_refs,
      source_request_id: row.source_request_id, source_statuses: row.source_statuses,
      source_partial: row.source_partial, observed_at: row.observed_at, created_at: row.risk_created_at,
    }),
  };
}

const JOINED_ALERT_COLUMNS = `
  a.id, a.firm_id, a.watch_id, a.portfolio_mark_id, a.risk_score_id, a.severity, a.status,
  a.policy_version, a.created_at, a.read_at, a.dismissed_at, a.updated_at,
  r.id AS risk_id, r.watch_id AS risk_watch_id, r.portfolio_mark_id AS risk_portfolio_mark_id,
  r.candidate_source, r.candidate_registry_reference, r.candidate_mark_text, r.visual_score,
  r.phonetic_score, r.class_overlap_score, r.composite_score, r.conceptual_score,
  r.composite_rating, r.methodology_version, r.matched_mark_refs, r.source_request_id,
  r.source_statuses, r.source_partial, r.observed_at, r.created_at AS risk_created_at`;

export class AlertRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function' || typeof database.connect !== 'function') {
      throw new TypeError('AlertRepository needs a PostgreSQL pool-like database.');
    }
    this.database = database;
  }

  async persistSnapshotAndAlert({ snapshot, alertPolicy }) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const insertedRisk = await client.query(
        `INSERT INTO risk_scores (
          firm_id, watch_id, portfolio_mark_id, candidate_source, candidate_registry_reference,
          candidate_mark_text, visual_score, phonetic_score, class_overlap_score, composite_score,
          conceptual_score, composite_rating, methodology_version, matched_mark_refs, source_request_id,
          source_statuses, source_partial, observed_at, fingerprint
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17,$18,$19)
        ON CONFLICT (firm_id, watch_id, fingerprint) DO NOTHING RETURNING ${RISK_COLUMNS}`,
        [
          snapshot.firmId, snapshot.watchId, snapshot.portfolioMarkId, snapshot.candidateSource,
          snapshot.candidateRegistryReference, snapshot.candidateMarkText, snapshot.visualScore,
          snapshot.phoneticScore, snapshot.classOverlapScore, snapshot.compositeScore,
          snapshot.conceptualScore, snapshot.compositeRating, snapshot.methodologyVersion,
          JSON.stringify(snapshot.matchedMarkRefs), snapshot.sourceRequestId,
          JSON.stringify(snapshot.sourceStatuses), snapshot.sourcePartial, snapshot.observedAt,
          snapshot.fingerprint,
        ],
      );
      let risk = insertedRisk.rowCount ? riskScoreFromRow(insertedRisk.rows[0]) : null;
      if (!risk) {
        const existing = await client.query(
          `SELECT ${RISK_COLUMNS} FROM risk_scores
           WHERE firm_id = $1 AND watch_id = $2 AND fingerprint = $3`,
          [snapshot.firmId, snapshot.watchId, snapshot.fingerprint],
        );
        risk = riskScoreFromRow(existing.rows[0]);
      }

      let alert = null;
      let createdAlert = false;
      if (alertPolicy.eligible) {
        const insertedAlert = await client.query(
          `INSERT INTO alerts (firm_id, watch_id, portfolio_mark_id, risk_score_id, severity, policy_version)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (risk_score_id) DO NOTHING
           RETURNING ${ALERT_COLUMNS}`,
          [snapshot.firmId, snapshot.watchId, snapshot.portfolioMarkId, risk.id,
            alertPolicy.severity, alertPolicy.policyVersion],
        );
        if (insertedAlert.rowCount) {
          alert = alertFromRow(insertedAlert.rows[0]);
          createdAlert = true;
        }
        else {
          const existingAlert = await client.query(
            `SELECT ${ALERT_COLUMNS} FROM alerts WHERE firm_id = $1 AND risk_score_id = $2`,
            [snapshot.firmId, risk.id],
          );
          alert = alertFromRow(existingAlert.rows[0]);
        }
      }
      await client.query('COMMIT');
      return { riskScore: risk, alert, createdRiskScore: insertedRisk.rowCount > 0, createdAlert };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async list({ firmId, filters, pagination }) {
    const values = [firmId];
    const clauses = ['a.firm_id = $1'];
    const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
    if (filters.status) add('a.status = ?', filters.status);
    if (filters.severity) add('a.severity = ?', filters.severity);
    if (filters.watchId) add('a.watch_id = ?', filters.watchId);
    if (filters.portfolioMarkId) add('a.portfolio_mark_id = ?', filters.portfolioMarkId);
    if (filters.createdFrom) add('a.created_at >= ?', filters.createdFrom);
    if (filters.createdTo) add('a.created_at <= ?', filters.createdTo);
    const where = clauses.join(' AND ');
    const counted = await this.database.query(`SELECT count(*)::integer AS total FROM alerts a WHERE ${where}`, values);
    const pageValues = [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize];
    const result = await this.database.query(
      `SELECT ${JOINED_ALERT_COLUMNS} FROM alerts a JOIN risk_scores r
       ON r.id = a.risk_score_id AND r.firm_id = a.firm_id WHERE ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    return { items: result.rows.map(alertWithRisk), total: counted.rows[0].total };
  }

  async get({ firmId, alertId }) {
    const result = await this.database.query(
      `SELECT ${JOINED_ALERT_COLUMNS} FROM alerts a JOIN risk_scores r
       ON r.id = a.risk_score_id AND r.firm_id = a.firm_id
       WHERE a.firm_id = $1 AND a.id = $2`, [firmId, alertId],
    );
    return result.rowCount ? alertWithRisk(result.rows[0]) : null;
  }

  async transition({ firmId, alertId, action, at }) {
    const target = action === 'read' ? 'read' : 'dismissed';
    const allowed = action === 'read' ? ['unread'] : ['unread', 'read'];
    const result = await this.database.query(
      `UPDATE alerts SET status = $3,
       read_at = CASE WHEN $3 = 'read' THEN $4 ELSE read_at END,
       dismissed_at = CASE WHEN $3 = 'dismissed' THEN $4 ELSE dismissed_at END,
       updated_at = $4 WHERE firm_id = $1 AND id = $2 AND status = ANY($5::varchar[])
       RETURNING id`,
      [firmId, alertId, target, at, allowed],
    );
    return result.rowCount > 0;
  }
}
