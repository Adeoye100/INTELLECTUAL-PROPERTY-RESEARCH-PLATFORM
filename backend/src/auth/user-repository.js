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

export class UserRepository {
  constructor(pool) {
    this.pool = pool;
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

      let firm = firmResult.rows[0];
      let role = 'viewer';
      if (!firm) {
        const inserted = await client.query(
          `INSERT INTO firms (name, subscription_tier)
           VALUES ($1, 'free')
           RETURNING id, name, subscription_tier`,
          [firmName],
        );
        firm = inserted.rows[0];
        role = 'admin';
      }

      const userResult = await client.query(
        `INSERT INTO users (firm_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, firm_id, email, password_hash, role, created_at, last_login_at`,
        [firm.id, email, passwordHash, role],
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
