const invitationError = (code) => Object.assign(new Error(code), { code });

function timestamp(value) {
  return value instanceof Date ? value : new Date(value);
}

function statusFor(row, now = Date.now()) {
  if (row.used_at || row.accepted_at) return 'accepted';
  if (row.superseded_by) return 'superseded';
  if (row.revoked_at) return 'revoked';
  if (timestamp(row.expires_at).getTime() <= now) return 'expired';
  return 'pending';
}

export function invitationFromRow(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    issuedByUserId: row.issued_by_user_id,
    issuerEmail: row.issuer_email ?? null,
    email: row.email,
    intendedName: row.intended_name,
    role: row.role,
    expiresAt: timestamp(row.expires_at),
    usedAt: row.used_at ? timestamp(row.used_at) : null,
    acceptedAt: row.accepted_at ? timestamp(row.accepted_at) : null,
    revokedAt: row.revoked_at ? timestamp(row.revoked_at) : null,
    supersededBy: row.superseded_by ?? null,
    lastSentAt: row.last_sent_at ? timestamp(row.last_sent_at) : null,
    firmName: row.firm_name,
    tokenHash: row.token_hash ?? null,
    status: statusFor(row),
  };
}

function publicUser(row) {
  return {
    id: row.id, firmId: row.firm_id, email: row.email, role: row.role,
    lastLoginAt: row.last_login_at ? timestamp(row.last_login_at) : null,
    status: 'active',
  };
}

const invitationSelect = `
  SELECT invitation.*, firm.name AS firm_name, issuer.email AS issuer_email
  FROM firm_invitations invitation
  JOIN firms firm ON firm.id = invitation.firm_id
  LEFT JOIN users issuer ON issuer.id = invitation.issued_by_user_id`;

export class InvitationRepository {
  constructor(pool) { this.pool = pool; }

  async withTransaction(work) {
    const transaction = await this.pool.connect();
    try {
      await transaction.query('BEGIN');
      const result = await work(transaction);
      await transaction.query('COMMIT');
      return result;
    } catch (error) {
      await transaction.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { transaction.release(); }
  }

  async listMembers({ firmId }) {
    const result = await this.pool.query(
      `SELECT id, firm_id, email, role, last_login_at FROM users WHERE firm_id = $1 ORDER BY email ASC`,
      [firmId],
    );
    return result.rows.map(publicUser);
  }

  async listInvitations({ firmId }) {
    const result = await this.pool.query(`${invitationSelect} WHERE invitation.firm_id = $1 ORDER BY invitation.created_at DESC, invitation.id DESC`, [firmId]);
    return result.rows.map(invitationFromRow);
  }

  async findInvitationByTokenHash(tokenHash) {
    const result = await this.pool.query(`${invitationSelect} WHERE invitation.token_hash = $1`, [tokenHash]);
    return result.rowCount ? invitationFromRow(result.rows[0]) : null;
  }

  async findInvitationById(id) {
    const result = await this.pool.query(`${invitationSelect} WHERE invitation.id = $1`, [id]);
    return result.rowCount ? invitationFromRow(result.rows[0]) : null;
  }

  async assertAdmin(transaction, { firmId, actorSupabaseUserId }) {
    const result = await transaction.query(
      `SELECT id FROM users WHERE firm_id = $1 AND supabase_user_id = $2 AND role = 'admin' FOR UPDATE`,
      [firmId, actorSupabaseUserId],
    );
    if (!result.rowCount) throw invitationError('ADMIN_REQUIRED');
    return result.rows[0].id;
  }

  async issue({ transaction, firmId, actorSupabaseUserId, id, tokenHash, email, intendedName, role, expiresAt }) {
    const issuerUserId = await this.assertAdmin(transaction, { firmId, actorSupabaseUserId });
    await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${firmId}:${email}`]);
    await transaction.query(
      `UPDATE firm_invitations SET revoked_at = now()
       WHERE firm_id = $1 AND email = $2 AND used_at IS NULL AND revoked_at IS NULL
         AND superseded_by IS NULL AND expires_at <= now()`,
      [firmId, email],
    );
    const member = await transaction.query(`SELECT id FROM users WHERE firm_id = $1 AND email = $2 FOR UPDATE`, [firmId, email]);
    if (member.rowCount) throw invitationError('MEMBER_EXISTS');
    const active = await transaction.query(
      `SELECT id FROM firm_invitations WHERE firm_id = $1 AND email = $2
       AND used_at IS NULL AND revoked_at IS NULL AND superseded_by IS NULL FOR UPDATE`,
      [firmId, email],
    );
    if (active.rowCount) throw invitationError('DUPLICATE_ACTIVE');
    const inserted = await transaction.query(
      `INSERT INTO firm_invitations (id, firm_id, issued_by_user_id, email, intended_name, role, expires_at, token_hash, last_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
      [id, firmId, issuerUserId, email, intendedName, role, expiresAt, tokenHash],
    );
    const full = await transaction.query(`${invitationSelect} WHERE invitation.id = $1`, [inserted.rows[0].id]);
    return invitationFromRow(full.rows[0]);
  }

  async resend({ transaction, firmId, actorSupabaseUserId, invitationId, id, tokenHash, expiresAt }) {
    const issuerUserId = await this.assertAdmin(transaction, { firmId, actorSupabaseUserId });
    const current = await transaction.query(`${invitationSelect} WHERE invitation.firm_id = $1 AND invitation.id = $2 FOR UPDATE OF invitation`, [firmId, invitationId]);
    if (!current.rowCount) throw invitationError('NOT_FOUND');
    const invitation = invitationFromRow(current.rows[0]);
    if (invitation.status !== 'pending') throw invitationError('NOT_PENDING');
    // Revoke first to leave the partial active-invitation uniqueness set before
    // inserting the replacement. The self-referential superseded_by FK cannot
    // point at an invitation row that has not been inserted yet.
    await transaction.query('UPDATE firm_invitations SET revoked_at = now() WHERE id = $1', [invitationId]);
    const inserted = await transaction.query(
      `INSERT INTO firm_invitations (id, firm_id, issued_by_user_id, email, intended_name, role, expires_at, token_hash, last_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
      [id, firmId, issuerUserId, invitation.email, invitation.intendedName, invitation.role, expiresAt, tokenHash],
    );
    await transaction.query('UPDATE firm_invitations SET superseded_by = $2 WHERE id = $1', [invitationId, inserted.rows[0].id]);
    const full = await transaction.query(`${invitationSelect} WHERE invitation.id = $1`, [inserted.rows[0].id]);
    return { previous: invitation, invitation: invitationFromRow(full.rows[0]) };
  }

  async restoreUndeliveredResend({ transaction, firmId, actorSupabaseUserId, previousInvitationId, invitationId }) {
    await this.assertAdmin(transaction, { firmId, actorSupabaseUserId });
    const previousResult = await transaction.query(
      `${invitationSelect} WHERE invitation.firm_id = $1 AND invitation.id = $2 FOR UPDATE OF invitation`,
      [firmId, previousInvitationId],
    );
    const replacementResult = await transaction.query(
      `${invitationSelect} WHERE invitation.firm_id = $1 AND invitation.id = $2 FOR UPDATE OF invitation`,
      [firmId, invitationId],
    );
    if (!previousResult.rowCount || !replacementResult.rowCount) throw invitationError('NOT_FOUND');
    const previous = invitationFromRow(previousResult.rows[0]);
    const replacement = invitationFromRow(replacementResult.rows[0]);
    if (previous.status !== 'superseded' || replacement.status !== 'pending') throw invitationError('NOT_PENDING');
    await transaction.query('UPDATE firm_invitations SET revoked_at = now() WHERE id = $1', [invitationId]);
    await transaction.query(
      `UPDATE firm_invitations SET revoked_at = NULL, superseded_by = NULL
       WHERE id = $1 AND used_at IS NULL AND accepted_at IS NULL`,
      [previousInvitationId],
    );
    const afterPrevious = await transaction.query(`${invitationSelect} WHERE invitation.id = $1`, [previousInvitationId]);
    const afterReplacement = await transaction.query(`${invitationSelect} WHERE invitation.id = $1`, [invitationId]);
    return {
      previous: invitationFromRow(afterPrevious.rows[0]),
      replacementBefore: replacement,
      replacement: invitationFromRow(afterReplacement.rows[0]),
    };
  }

  async revoke({ transaction, firmId, actorSupabaseUserId, invitationId }) {
    await this.assertAdmin(transaction, { firmId, actorSupabaseUserId });
    const current = await transaction.query(`${invitationSelect} WHERE invitation.firm_id = $1 AND invitation.id = $2 FOR UPDATE OF invitation`, [firmId, invitationId]);
    if (!current.rowCount) throw invitationError('NOT_FOUND');
    const invitation = invitationFromRow(current.rows[0]);
    if (invitation.status !== 'pending') throw invitationError('NOT_PENDING');
    await transaction.query('UPDATE firm_invitations SET revoked_at = now() WHERE id = $1', [invitationId]);
    const updated = await transaction.query(`${invitationSelect} WHERE invitation.id = $1`, [invitationId]);
    return { before: invitation, after: invitationFromRow(updated.rows[0]) };
  }

  async redeem({ transaction, invitationId, tokenHash, legacyClaims, supabaseUserId, email }) {
    const current = await transaction.query(`${invitationSelect} WHERE invitation.id = $1 FOR UPDATE OF invitation`, [invitationId]);
    if (!current.rowCount) throw invitationError('INVALID');
    const invitation = invitationFromRow(current.rows[0]);
    const legacyMatches = legacyClaims
      && legacyClaims.firmId === invitation.firmId
      && legacyClaims.email === invitation.email
      && legacyClaims.role === invitation.role
      && legacyClaims.expiresAtSeconds === Math.floor(invitation.expiresAt.getTime() / 1_000);
    if ((tokenHash && invitation.tokenHash !== tokenHash) || (!tokenHash && !legacyMatches)) throw invitationError('INVALID');
    if (invitation.status !== 'pending') throw invitationError('UNAVAILABLE');
    if (email !== invitation.email) throw invitationError('EMAIL_MISMATCH');

    const identity = await transaction.query('SELECT id FROM users WHERE supabase_user_id = $1 FOR UPDATE', [supabaseUserId]);
    if (identity.rowCount) throw invitationError('IDENTITY_EXISTS');
    const existingEmail = await transaction.query('SELECT id, firm_id, supabase_user_id FROM users WHERE email = $1 FOR UPDATE', [email]);
    let user;
    if (existingEmail.rowCount) {
      const existing = existingEmail.rows[0];
      if (existing.supabase_user_id) throw invitationError('ACCOUNT_RECOVERY_REQUIRED');
      if (existing.firm_id !== invitation.firmId) throw invitationError('MEMBERSHIP_EXISTS');
      const linked = await transaction.query(
        `UPDATE users SET supabase_user_id = $2 WHERE id = $1 AND supabase_user_id IS NULL
         RETURNING id, firm_id, email, role, last_login_at`,
        [existing.id, supabaseUserId],
      );
      if (!linked.rowCount) throw invitationError('ACCOUNT_RECOVERY_REQUIRED');
      user = publicUser(linked.rows[0]);
    } else {
      const inserted = await transaction.query(
        `INSERT INTO users (firm_id, email, password_hash, role, supabase_user_id)
         VALUES ($1, $2, NULL, $3, $4) RETURNING id, firm_id, email, role, last_login_at`,
        [invitation.firmId, email, invitation.role, supabaseUserId],
      );
      user = publicUser(inserted.rows[0]);
    }
    await transaction.query('UPDATE firm_invitations SET used_at = now(), accepted_at = now() WHERE id = $1', [invitation.id]);
    const accepted = await transaction.query(`${invitationSelect} WHERE invitation.id = $1`, [invitation.id]);
    return { invitation: invitationFromRow(accepted.rows[0]), user };
  }
}
