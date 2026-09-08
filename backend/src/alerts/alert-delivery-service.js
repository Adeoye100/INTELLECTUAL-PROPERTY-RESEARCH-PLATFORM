import { AppError } from '../errors.js';
import { riskScoreFromRow } from './alert-repository.js';

export class AlertDeliveryService {
  constructor({ database, alertMailer, maxAttempts = 3, clock = () => new Date() }) {
    if (!database || typeof database.query !== 'function') {
      throw new TypeError('AlertDeliveryService requires a database connection pool.');
    }
    if (!alertMailer || typeof alertMailer.sendAlertEmail !== 'function') {
      throw new TypeError('AlertDeliveryService requires an alert mailer.');
    }
    this.database = database;
    this.alertMailer = alertMailer;
    this.maxAttempts = maxAttempts;
    this.clock = clock;
  }

  async recordDelivery({ firmId, alertId, recipientEmail, channel, mode }) {
    if (!recipientEmail || typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
      throw new TypeError('recordDelivery requires a valid recipientEmail.');
    }
    const result = await this.database.query(
      `INSERT INTO alert_deliveries (
        firm_id, alert_id, recipient_email, channel, mode, status
      ) VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, firm_id, alert_id, recipient_email, channel, mode, status, attempt_count, created_at`,
      [firmId, alertId, recipientEmail.trim().toLowerCase(), channel, mode],
    );
    return result.rows[0];
  }

  async processPendingRealTimeDeliveries(batchSize = 25) {
    const now = this.clock().toISOString();
    const pending = await this.database.query(
      `SELECT ad.id AS delivery_id, ad.firm_id, ad.alert_id, ad.recipient_email, ad.attempt_count,
              a.id AS alert_id, a.severity, a.status AS alert_status, a.created_at AS alert_created_at,
              r.id AS risk_id, r.candidate_source, r.candidate_registry_reference, r.candidate_mark_text,
              r.visual_score, r.phonetic_score, r.class_overlap_score, r.composite_score, r.conceptual_score,
              r.composite_rating, r.methodology_version, r.matched_mark_refs, r.source_request_id,
              r.source_statuses, r.source_partial, r.observed_at, r.created_at AS risk_created_at,
              p.mark_text AS portfolio_mark_text, p.jurisdiction AS portfolio_jurisdiction
       FROM alert_deliveries ad
       JOIN alerts a ON a.id = ad.alert_id AND a.firm_id = ad.firm_id
       JOIN risk_scores r ON r.id = a.risk_score_id AND r.firm_id = a.firm_id
       LEFT JOIN portfolio_marks p ON p.id = a.portfolio_mark_id AND p.firm_id = a.firm_id
       WHERE ad.channel = 'email' AND ad.mode = 'real-time' AND ad.status IN ('pending', 'processing')
         AND ad.next_attempt_at <= $1 AND ad.attempt_count < $2
       ORDER BY ad.created_at ASC
       LIMIT $3 FOR UPDATE OF ad SKIP LOCKED`,
      [now, this.maxAttempts, batchSize],
    );

    const processed = [];
    for (const row of pending.rows) {
      const riskScore = riskScoreFromRow({
        id: row.risk_id, firm_id: row.firm_id, watch_id: row.watch_id,
        portfolio_mark_id: row.portfolio_mark_id, candidate_source: row.candidate_source,
        candidate_registry_reference: row.candidate_registry_reference, candidate_mark_text: row.candidate_mark_text,
        visual_score: row.visual_score, phonetic_score: row.phonetic_score,
        class_overlap_score: row.class_overlap_score, composite_score: row.composite_score,
        conceptual_score: row.conceptual_score, composite_rating: row.composite_rating,
        methodology_version: row.methodology_version, matched_mark_refs: row.matched_mark_refs,
        source_request_id: row.source_request_id, source_statuses: row.source_statuses,
        source_partial: row.source_partial, observed_at: row.observed_at, created_at: row.risk_created_at,
      });

      const alert = {
        id: row.alert_id,
        severity: row.severity,
        status: row.alert_status,
        createdAt: row.alert_created_at instanceof Date ? row.alert_created_at.toISOString() : String(row.alert_created_at),
        riskScore,
      };

      const portfolioMark = {
        markText: row.portfolio_mark_text,
        jurisdiction: row.portfolio_jurisdiction,
      };

      const currentAttempts = row.attempt_count + 1;
      try {
        await this.alertMailer.sendAlertEmail({
          recipientEmail: row.recipient_email,
          alert,
          portfolioMark,
          riskScore,
        });

        await this.database.query(
          `UPDATE alert_deliveries SET status = 'delivered', delivered_at = now(), attempt_count = $2, updated_at = now()
           WHERE id = $1`,
          [row.delivery_id, currentAttempts],
        );
        processed.push({ id: row.delivery_id, status: 'delivered' });
      } catch (error) {
        const isFinal = currentAttempts >= this.maxAttempts;
        const nextAttemptMs = Date.now() + Math.pow(2, currentAttempts) * 60_000;
        const nextAttemptAt = new Date(nextAttemptMs).toISOString();
        const errorCode = error instanceof AppError ? error.code : 'DELIVERY_FAILED';

        await this.database.query(
          `UPDATE alert_deliveries
           SET status = $2, attempt_count = $3, next_attempt_at = $4, last_error_code = $5, updated_at = now()
           WHERE id = $1`,
          [row.delivery_id, isFinal ? 'failed' : 'pending', currentAttempts, nextAttemptAt, errorCode],
        );
        processed.push({ id: row.delivery_id, status: isFinal ? 'failed' : 'retryable', errorCode });
      }
    }

    return processed;
  }

  async processPendingDigestDeliveries() {
    const now = this.clock().toISOString();
    const pending = await this.database.query(
      `SELECT ad.id AS delivery_id, ad.firm_id, ad.alert_id, ad.recipient_email, ad.attempt_count,
              a.id AS alert_id, a.severity, a.status AS alert_status, a.created_at AS alert_created_at,
              r.id AS risk_id, r.candidate_source, r.candidate_registry_reference, r.candidate_mark_text,
              r.visual_score, r.phonetic_score, r.class_overlap_score, r.composite_score, r.conceptual_score,
              r.composite_rating, r.methodology_version, r.matched_mark_refs, r.source_request_id,
              r.source_statuses, r.source_partial, r.observed_at, r.created_at AS risk_created_at,
              p.mark_text AS portfolio_mark_text, p.jurisdiction AS portfolio_jurisdiction
       FROM alert_deliveries ad
       JOIN alerts a ON a.id = ad.alert_id AND a.firm_id = ad.firm_id
       JOIN risk_scores r ON r.id = a.risk_score_id AND r.firm_id = a.firm_id
       LEFT JOIN portfolio_marks p ON p.id = a.portfolio_mark_id AND p.firm_id = a.firm_id
       WHERE ad.channel = 'email' AND ad.mode = 'digest' AND ad.status IN ('pending', 'processing')
         AND ad.next_attempt_at <= $1 AND ad.attempt_count < $2
       ORDER BY ad.recipient_email ASC, ad.created_at ASC
       FOR UPDATE OF ad SKIP LOCKED`,
      [now, this.maxAttempts],
    );

    if (pending.rowCount === 0) return { processed: 0, digests: 0 };

    // Group by recipient_email
    const groups = new Map();
    for (const row of pending.rows) {
      const email = row.recipient_email;
      if (!groups.has(email)) groups.set(email, []);
      groups.get(email).push(row);
    }

    let digestsSent = 0;
    let totalProcessed = 0;

    for (const [recipientEmail, rows] of groups.entries()) {
      const items = rows.map((row) => ({
        alert: {
          id: row.alert_id,
          severity: row.severity,
          status: row.alert_status,
          createdAt: row.alert_created_at instanceof Date ? row.alert_created_at.toISOString() : String(row.alert_created_at),
        },
        riskScore: riskScoreFromRow({
          id: row.risk_id, firm_id: row.firm_id, watch_id: row.watch_id,
          portfolio_mark_id: row.portfolio_mark_id, candidate_source: row.candidate_source,
          candidate_registry_reference: row.candidate_registry_reference, candidate_mark_text: row.candidate_mark_text,
          visual_score: row.visual_score, phonetic_score: row.phonetic_score,
          class_overlap_score: row.class_overlap_score, composite_score: row.composite_score,
          conceptual_score: row.conceptual_score, composite_rating: row.composite_rating,
          methodology_version: row.methodology_version, matched_mark_refs: row.matched_mark_refs,
          source_request_id: row.source_request_id, source_statuses: row.source_statuses,
          source_partial: row.source_partial, observed_at: row.observed_at, created_at: row.risk_created_at,
        }),
        portfolioMark: {
          markText: row.portfolio_mark_text,
          jurisdiction: row.portfolio_jurisdiction,
        },
      }));

      const deliveryIds = rows.map((r) => r.delivery_id);
      const currentAttempts = Math.max(...rows.map((r) => r.attempt_count)) + 1;

      try {
        await this.alertMailer.sendDigestEmail({ recipientEmail, alerts: items });

        await this.database.query(
          `UPDATE alert_deliveries
           SET status = 'delivered', delivered_at = now(), attempt_count = $2, updated_at = now()
           WHERE id = ANY($1::uuid[])`,
          [deliveryIds, currentAttempts],
        );
        digestsSent += 1;
        totalProcessed += deliveryIds.length;
      } catch (error) {
        const isFinal = currentAttempts >= this.maxAttempts;
        const nextAttemptMs = Date.now() + Math.pow(2, currentAttempts) * 60_000;
        const nextAttemptAt = new Date(nextAttemptMs).toISOString();
        const errorCode = error instanceof AppError ? error.code : 'DELIVERY_FAILED';

        await this.database.query(
          `UPDATE alert_deliveries
           SET status = $2, attempt_count = $3, next_attempt_at = $4, last_error_code = $5, updated_at = now()
           WHERE id = ANY($1::uuid[])`,
          [deliveryIds, isFinal ? 'failed' : 'pending', currentAttempts, nextAttemptAt, errorCode],
        );
        totalProcessed += deliveryIds.length;
      }
    }

    return { processed: totalProcessed, digests: digestsSent };
  }
}
