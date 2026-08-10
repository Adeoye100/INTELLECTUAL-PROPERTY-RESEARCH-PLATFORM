const normalizedFirmSql = "lower(regexp_replace(btrim(name), '\\s+', ' ', 'g'))";

const mapUser = (row) => ({
  id: row.id,
  firmId: row.firm_id,
  email: row.email,
  role: row.role,
  passwordHash: row.password_hash,
  lastLoginAt: row.last_login_at,
  firm: row.firm_name ? {
    id: row.firm_id,
    name: row.firm_name,
    subscriptionTier: row.subscription_tier,
  } : undefined,
});

const invitationError = (code) => Object.assign(new Error(code), { code });

const mapInvitation = (row) => ({
  id: row.id,
  firmId: row.firm_id,
  issuedByUserId: row.issued_by_user_id,
  email: row.email,
  intendedName: row.intended_name,
  role: row.role,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
  firmName: row.firm_name,
});

export class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findBySupabaseUserId(supabaseUserId) {
    const result = await this.pool.query(
      `SELECT role, firm_id
       FROM users
       WHERE supabase_user_id = $1`,
      [supabaseUserId],
    );
    if (!result.rowCount) return null;
    return { role: result.rows[0].role, firmId: result.rows[0].firm_id };
  }

  async findOrLinkBySupabaseIdentity(supabaseUserId, normalizedEmail) {
    const result = await this.pool.query(
      `WITH existing AS (
         SELECT role, firm_id
         FROM users
         WHERE supabase_user_id = $1
       ), linked AS (
         UPDATE users
         SET supabase_user_id = $1
         WHERE supabase_user_id IS NULL
           AND email = $2
           AND NOT EXISTS (SELECT 1 FROM existing)
         RETURNING role, firm_id
       )
       SELECT role, firm_id FROM existing
       UNION ALL
       SELECT role, firm_id FROM linked
       LIMIT 1`,
      [supabaseUserId, normalizedEmail],
    );
    if (!result.rowCount) return null;
    return { role: result.rows[0].role, firmId: result.rows[0].firm_id };
  }

  async createWithFirm({ firmName, normalizedFirmName, email, passwordHash }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [normalizedFirmName]);

      const firmResult = await client.query(
        `SELECT id, name, subscription_tier FROM firms WHERE ${normalizedFirmSql} = $1`,
        [normalizedFirmName],
      );

      if (firmResult.rowCount) throw invitationError('FIRM_NAME_EXISTS');

      const inserted = await client.query(
        `INSERT INTO firms (name, subscription_tier)
         VALUES ($1, 'free')
         RETURNING id, name, subscription_tier`,
        [firmName],
      );
      const firm = inserted.rows[0];

      const userResult = await client.query(
        `INSERT INTO users (firm_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, firm_id, email, password_hash, role, created_at, last_login_at`,
        [firm.id, email, passwordHash, 'admin'],
      );
      await client.query('COMMIT');

      return mapUser({
        ...userResult.rows[0],
        firm_name: firm.name,
        subscription_tier: firm.subscription_tier,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createInvitation({ id, issuerUserId, firmId, email, intendedName, role, expiresAt }) {
    const result = await this.pool.query(
      `WITH inserted AS (
         INSERT INTO firm_invitations (
           id, firm_id, issued_by_user_id, email, intended_name, role, expires_at
         )
         SELECT $1, u.firm_id, u.id, $4, $5, $6, $7
         FROM users u
         WHERE u.id = $2 AND u.firm_id = $3 AND u.role = 'admin'
         RETURNING *
       )
       SELECT inserted.*, firms.name AS firm_name
       FROM inserted
       JOIN firms ON firms.id = inserted.firm_id`,
      [id, issuerUserId, firmId, email, intendedName, role, expiresAt],
    );
    return result.rowCount ? mapInvitation(result.rows[0]) : null;
  }

  async findInvitation(id) {
    const result = await this.pool.query(
      `SELECT i.*, f.name AS firm_name
       FROM firm_invitations i
       JOIN firms f ON f.id = i.firm_id
       WHERE i.id = $1`,
      [id],
    );
    return result.rowCount ? mapInvitation(result.rows[0]) : null;
  }

  async acceptInvitation({ id, firmId, email, role, expiresAtSeconds, passwordHash }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const invitationResult = await client.query(
        `SELECT i.*, f.name AS firm_name, f.subscription_tier
         FROM firm_invitations i
         JOIN firms f ON f.id = i.firm_id
         WHERE i.id = $1
         FOR UPDATE OF i`,
        [id],
      );
      if (!invitationResult.rowCount) throw invitationError('INVITATION_INVALID');

      const invitation = invitationResult.rows[0];
      if (invitation.used_at) throw invitationError('INVITATION_USED');
      if (invitation.expires_at.getTime() <= Date.now()) {
        throw invitationError('INVITATION_EXPIRED');
      }
      if (
        invitation.firm_id !== firmId
        || invitation.email !== email
        || invitation.role !== role
        || Math.floor(invitation.expires_at.getTime() / 1_000) !== expiresAtSeconds
      ) {
        throw invitationError('INVITATION_INVALID');
      }

      const userResult = await client.query(
        `INSERT INTO users (firm_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, firm_id, email, password_hash, role, created_at, last_login_at`,
        [firmId, email, passwordHash, role],
      );
      await client.query('UPDATE firm_invitations SET used_at = now() WHERE id = $1', [id]);
      await client.query('COMMIT');

      return mapUser({
        ...userResult.rows[0],
        firm_name: invitation.firm_name,
        subscription_tier: invitation.subscription_tier,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findByEmail(email) {
    const result = await this.pool.query(
      `SELECT u.*, f.name AS firm_name, f.subscription_tier
       FROM users u
       JOIN firms f ON f.id = u.firm_id
       WHERE u.email = $1`,
      [email],
    );
    return result.rowCount ? mapUser(result.rows[0]) : null;
  }

  async findById(id) {
    const result = await this.pool.query(
      `SELECT u.*, f.name AS firm_name, f.subscription_tier
       FROM users u
       JOIN firms f ON f.id = u.firm_id
       WHERE u.id = $1`,
      [id],
    );
    return result.rowCount ? mapUser(result.rows[0]) : null;
  }

  async recordLogin(id) {
    const result = await this.pool.query(
      'UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING last_login_at',
      [id],
    );
    return result.rows[0]?.last_login_at ?? null;
  }
}
