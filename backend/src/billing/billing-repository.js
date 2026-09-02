function transactionFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    firmId: row.firm_id,
    reference: row.reference,
    tier: row.tier,
    planCode: row.plan_code,
    amountSubunit: Number(row.amount_subunit),
    currency: row.currency,
    status: row.status,
    providerTransactionId: row.provider_transaction_id,
    paidAt: row.paid_at?.toISOString?.() ?? row.paid_at ?? null,
    initiatedByUserId: row.initiated_by_user_id ?? null,
    initiatedBySupabaseUserId: row.initiated_by_supabase_user_id ?? null,
    initiatedByEmail: row.initiated_by_email ?? null,
  };
}

export class BillingRepository {
  constructor(database) { this.database = database; }

  async createPending({ firmId, actorUserId, reference, plan }) {
    const result = await this.database.query(
      `INSERT INTO billing_transactions (
         firm_id, initiated_by_user_id, reference, tier, plan_code, amount_subunit, currency
       )
       SELECT $1, id, $3, $4, $5, $6, $7
       FROM users
       WHERE firm_id = $1 AND supabase_user_id = $2
       RETURNING *`,
      [firmId, actorUserId, reference, plan.tier, plan.planCode, plan.amountSubunit, plan.currency],
    );
    return transactionFromRow(result.rows[0]);
  }

  async markFailed(reference) {
    await this.database.query(
      `UPDATE billing_transactions SET status = 'failed', updated_at = now()
       WHERE reference = $1 AND status = 'pending'`, [reference],
    );
  }

  async findForFirm({ firmId, reference }) {
    const result = await this.database.query(
      `SELECT bt.*, app_user.supabase_user_id AS initiated_by_supabase_user_id,
              app_user.email AS initiated_by_email
       FROM billing_transactions bt
       LEFT JOIN users app_user ON app_user.id = bt.initiated_by_user_id
       WHERE bt.firm_id = $1 AND bt.reference = $2`, [firmId, reference],
    );
    return transactionFromRow(result.rows[0]);
  }

  async getSummary(firmId) {
    const firm = await this.database.query(
      `SELECT id, subscription_tier, subscription_status, subscription_provider,
              subscription_renews_at
       FROM firms WHERE id = $1`, [firmId],
    );
    const transactions = await this.database.query(
      `SELECT id, firm_id, reference, tier, plan_code, amount_subunit, currency,
              status, provider_transaction_id, paid_at
       FROM billing_transactions WHERE firm_id = $1
       ORDER BY created_at DESC LIMIT 10`, [firmId],
    );
    return {
      subscription: firm.rowCount ? {
        tier: firm.rows[0].subscription_tier,
        status: firm.rows[0].subscription_status,
        provider: firm.rows[0].subscription_provider,
        renewsAt: firm.rows[0].subscription_renews_at?.toISOString?.() ?? firm.rows[0].subscription_renews_at ?? null,
      } : null,
      transactions: transactions.rows.map(transactionFromRow),
    };
  }

  async recordIgnoredWebhook({ digest, eventType, reference }) {
    await this.database.query(
      `INSERT INTO billing_webhook_events (payload_digest, event_type, reference, processed_at)
       VALUES ($1, $2, $3, now()) ON CONFLICT (payload_digest) DO NOTHING`,
      [digest, eventType, reference],
    );
  }

  async applySubscriptionEvent({
    digest, eventType, customerCode, subscriptionCode, status, renewsAt,
  }) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const event = await client.query(
        `INSERT INTO billing_webhook_events (payload_digest, event_type, reference)
         VALUES ($1, $2, $3)
         ON CONFLICT (payload_digest) DO UPDATE SET payload_digest = EXCLUDED.payload_digest
         RETURNING processed_at`,
        [digest, eventType, subscriptionCode],
      );
      if (event.rows[0]?.processed_at) {
        await client.query('COMMIT');
        return { duplicate: true, firmId: null };
      }
      const updated = await client.query(
        `UPDATE firms
         SET subscription_status = $3,
             subscription_provider = 'paystack',
             subscription_code = $2,
             subscription_renews_at = $4
         WHERE subscription_customer_code = $1
           AND subscription_provider = 'paystack'
           AND (subscription_code IS NULL OR subscription_code = $2)
         RETURNING id`,
        [customerCode, subscriptionCode, status, renewsAt],
      );
      await client.query(
        'UPDATE billing_webhook_events SET processed_at = now() WHERE payload_digest = $1',
        [digest],
      );
      await client.query('COMMIT');
      return { duplicate: false, firmId: updated.rows[0]?.id ?? null };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async confirmVerifiedPayment({
    reference, providerTransactionId, paidAt, customerCode = null, subscriptionCode = null,
    renewsAt = null, digest = null,
  }) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      if (digest) {
        const event = await client.query(
          `INSERT INTO billing_webhook_events (payload_digest, event_type, reference)
           VALUES ($1, 'charge.success', $2)
           ON CONFLICT (payload_digest) DO UPDATE SET payload_digest = EXCLUDED.payload_digest
           RETURNING processed_at`, [digest, reference],
        );
        if (event.rows[0]?.processed_at) {
          await client.query('COMMIT');
          return { duplicate: true, transaction: null };
        }
      }
      const existing = await client.query(
        `SELECT bt.*, app_user.supabase_user_id AS initiated_by_supabase_user_id,
                app_user.email AS initiated_by_email
         FROM billing_transactions bt
         LEFT JOIN users app_user ON app_user.id = bt.initiated_by_user_id
         WHERE bt.reference = $1 FOR UPDATE OF bt`, [reference],
      );
      if (!existing.rowCount) {
        if (digest) await client.query('UPDATE billing_webhook_events SET processed_at = now() WHERE payload_digest = $1', [digest]);
        await client.query('COMMIT');
        return { duplicate: false, transaction: null };
      }
      const row = existing.rows[0];
      if (row.status !== 'paid') {
        await client.query(
          `UPDATE billing_transactions SET status = 'paid', provider_transaction_id = $2,
                  paid_at = $3, updated_at = now() WHERE id = $1`,
          [row.id, providerTransactionId, paidAt],
        );
        await client.query(
          `UPDATE firms SET subscription_tier = $2, subscription_status = 'active',
                  subscription_provider = 'paystack',
                  subscription_customer_code = COALESCE($3, subscription_customer_code),
                  subscription_code = COALESCE($4, subscription_code),
                  subscription_renews_at = COALESCE($5, subscription_renews_at)
           WHERE id = $1`, [row.firm_id, row.tier, customerCode, subscriptionCode, renewsAt],
        );
      }
      if (digest) await client.query('UPDATE billing_webhook_events SET processed_at = now() WHERE payload_digest = $1', [digest]);
      await client.query('COMMIT');
      return { duplicate: row.status === 'paid', transaction: transactionFromRow(row) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
}
