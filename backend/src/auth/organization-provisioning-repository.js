const normalizedFirmSql = "lower(regexp_replace(btrim(name), '\\s+', ' ', 'g'))";
const provisioningError = (code) => Object.assign(new Error(code), { code });

export class OrganizationProvisioningRepository {
  constructor(pool) { this.pool = pool; }

  async createIntent({ tokenHash, email, firmName, expiresAt }) {
    const result = await this.pool.query(
      `INSERT INTO organization_provisioning_intents (token_hash, email, firm_name, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING id, expires_at`,
      [tokenHash, email, firmName, expiresAt],
    );
    return { id: result.rows[0].id, expiresAt: result.rows[0].expires_at };
  }

  async createFirmFromIntent({ tokenHash, email, supabaseUserId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [supabaseUserId]);
      const existing = await client.query(`SELECT u.id, u.firm_id, u.email, u.role, f.name AS firm_name, f.subscription_tier FROM users u JOIN firms f ON f.id = u.firm_id WHERE u.supabase_user_id = $1`, [supabaseUserId]);
      if (existing.rowCount) { await client.query('COMMIT'); return this.mapUser(existing.rows[0]); }
      const intentResult = await client.query(`SELECT * FROM organization_provisioning_intents WHERE token_hash = $1 FOR UPDATE`, [tokenHash]);
      if (!intentResult.rowCount) throw provisioningError('INTENT_INVALID');
      const intent = intentResult.rows[0];
      if (intent.consumed_at || intent.expires_at.getTime() <= Date.now() || intent.email !== email) throw provisioningError('INTENT_INVALID');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [intent.firm_name.toLowerCase()]);
      const firmExists = await client.query(`SELECT id FROM firms WHERE ${normalizedFirmSql} = $1`, [intent.firm_name.toLowerCase().trim().replace(/\s+/g, ' ')]);
      if (firmExists.rowCount) throw provisioningError('FIRM_NAME_EXISTS');
      const firmResult = await client.query(`INSERT INTO firms (name, subscription_tier) VALUES ($1, 'free') RETURNING id, name, subscription_tier`, [intent.firm_name]);
      const firm = firmResult.rows[0];
      const userResult = await client.query(`INSERT INTO users (firm_id, email, password_hash, role, supabase_user_id) VALUES ($1, $2, NULL, 'admin', $3) RETURNING id, firm_id, email, role, last_login_at`, [firm.id, email, supabaseUserId]);
      await client.query('UPDATE organization_provisioning_intents SET consumed_at = now() WHERE id = $1', [intent.id]);
      await client.query('COMMIT');
      return this.mapUser({ ...userResult.rows[0], firm_name: firm.name, subscription_tier: firm.subscription_tier });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  mapUser(row) {
    return { id: row.id, firmId: row.firm_id, email: row.email, role: row.role, firm: { id: row.firm_id, name: row.firm_name, subscriptionTier: row.subscription_tier } };
  }
}
