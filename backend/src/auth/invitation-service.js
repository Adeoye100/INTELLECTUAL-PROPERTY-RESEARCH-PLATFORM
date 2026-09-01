import { randomUUID } from 'node:crypto';
import { AppError, badRequest, conflict, forbidden, gone } from '../errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit-taxonomy.js';
import { invitationAuditSnapshot } from '../audit/audit-snapshots.js';
import { createOpaqueInvitationToken, hashInvitationToken } from './invitation-token.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['admin', 'attorney', 'viewer']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailableMessage = 'This invitation is invalid or unavailable.';

const normalizedEmail = (value) => String(value ?? '').trim().toLowerCase();
const normalizedName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

function publicInvitation(invitation) {
  return {
    id: invitation.id, email: invitation.email, intendedName: invitation.intendedName,
    role: invitation.role, expiresAt: invitation.expiresAt.toISOString(),
    usedAt: invitation.usedAt?.toISOString() ?? null,
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    supersededBy: invitation.supersededBy, lastSentAt: invitation.lastSentAt?.toISOString() ?? null,
    firmName: invitation.firmName, issuerEmail: invitation.issuerEmail, status: invitation.status,
  };
}

function details(invitation) {
  return {
    email: invitation.email, firmName: invitation.firmName, role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

function publicMember(member) {
  return {
    id: member.id, email: member.email, role: member.role, status: member.status,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
  };
}

function validateIssueInput(input) {
  const email = normalizedEmail(input?.email);
  const fullName = normalizedName(input?.fullName);
  const role = String(input?.role ?? '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw badRequest('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' });
  if (fullName.length < 2 || fullName.length > 200) throw badRequest('VALIDATION_ERROR', 'Full name is required.', { field: 'fullName' });
  if (!ROLES.has(role)) throw badRequest('VALIDATION_ERROR', 'Role must be admin, attorney, or viewer.', { field: 'role' });
  return { email, fullName, role };
}

function requireAuth(auth) {
  if (!auth || typeof auth.userId !== 'string' || !UUID_PATTERN.test(auth.userId)
    || typeof auth.firmId !== 'string' || !UUID_PATTERN.test(auth.firmId)) {
    throw forbidden();
  }
}

export class InvitationService {
  constructor({ invitationRepository, tokenService, invitationMailer, auditService, roleFirmResolver, supabaseAdminUserService, inviteTokenTtlSeconds = 604_800 }) {
    this.invitationRepository = invitationRepository;
    this.tokenService = tokenService;
    this.invitationMailer = invitationMailer;
    this.auditService = auditService;
    this.roleFirmResolver = roleFirmResolver;
    this.supabaseAdminUserService = supabaseAdminUserService;
    this.inviteTokenTtlSeconds = inviteTokenTtlSeconds;
  }

  async listMembers(auth) {
    requireAuth(auth);
    return { users: (await this.invitationRepository.listMembers({ firmId: auth.firmId })).map(publicMember) };
  }

  async listInvitations(auth) {
    requireAuth(auth);
    return { invitations: (await this.invitationRepository.listInvitations({ firmId: auth.firmId })).map(publicInvitation) };
  }

  async issue(auth, input, requestContext = null) {
    requireAuth(auth);
    this.invitationMailer.assertAvailable();
    const { email, fullName, role } = validateIssueInput(input);
    const token = createOpaqueInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + (this.inviteTokenTtlSeconds * 1_000));
    let invitation;
    try {
      invitation = await this.invitationRepository.withTransaction(async (transaction) => {
        const created = await this.invitationRepository.issue({
          transaction, firmId: auth.firmId, actorSupabaseUserId: auth.userId, id: randomUUID(), tokenHash,
          email, intendedName: fullName, role, expiresAt,
        });
        await this.record(transaction, auth, AUDIT_ACTIONS.INVITATION_ISSUED, created, null, created, requestContext);
        return created;
      });
    } catch (error) { throw this.issueError(error); }
    try {
      await this.invitationMailer.sendInvitation({ invitation, token });
    } catch (error) {
      await this.revokeUndelivered(invitation, auth, requestContext);
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'INVITATION_EMAIL_UNAVAILABLE', 'Invitation email could not be delivered. Please retry.');
    }
    return { invitation: publicInvitation(invitation) };
  }

  async resend(auth, invitationId, requestContext = null) {
    requireAuth(auth);
    this.invitationMailer.assertAvailable();
    if (!UUID_PATTERN.test(invitationId)) throw badRequest('VALIDATION_ERROR', 'Invitation ID is invalid.', { field: 'invitationId' });
    const token = createOpaqueInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + (this.inviteTokenTtlSeconds * 1_000));
    let result;
    try {
      result = await this.invitationRepository.withTransaction(async (transaction) => {
        const rotated = await this.invitationRepository.resend({
          transaction, firmId: auth.firmId, actorSupabaseUserId: auth.userId, invitationId,
          id: randomUUID(), tokenHash, expiresAt,
        });
        await this.record(transaction, auth, AUDIT_ACTIONS.INVITATION_RESENT, rotated.invitation, rotated.previous, rotated.invitation, requestContext);
        return rotated;
      });
    } catch (error) { throw this.managementError(error); }
    try {
      await this.invitationMailer.sendInvitation({ invitation: result.invitation, token });
    } catch (error) {
      await this.revokeUndelivered(result.invitation, auth, requestContext);
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'INVITATION_EMAIL_UNAVAILABLE', 'Invitation email could not be delivered. Please retry.');
    }
    return { invitation: publicInvitation(result.invitation) };
  }

  async revoke(auth, invitationId, requestContext = null) {
    requireAuth(auth);
    if (!UUID_PATTERN.test(invitationId)) throw badRequest('VALIDATION_ERROR', 'Invitation ID is invalid.', { field: 'invitationId' });
    try {
      await this.invitationRepository.withTransaction(async (transaction) => {
        const changed = await this.invitationRepository.revoke({ transaction, firmId: auth.firmId, actorSupabaseUserId: auth.userId, invitationId });
        await this.record(transaction, auth, AUDIT_ACTIONS.INVITATION_REVOKED, changed.after, changed.before, changed.after, requestContext);
      });
    } catch (error) { throw this.managementError(error); }
  }

  async invitationDetails(token) {
    const resolved = await this.resolveToken(token);
    this.assertUsable(resolved.invitation);
    return details(resolved.invitation);
  }

  async redeem(token, auth, requestContext = null) {
    if (!auth || auth.supabaseRole !== 'authenticated' || !UUID_PATTERN.test(auth.userId)) throw forbidden('A verified Supabase session is required.');
    const resolved = await this.resolveToken(token);
    this.assertUsable(resolved.invitation);
    let authoritative;
    try { authoritative = await this.supabaseAdminUserService.getAuthoritativeUser(auth.userId); }
    catch { throw new AppError(503, 'IDENTITY_VERIFICATION_UNAVAILABLE', 'Identity verification is temporarily unavailable.'); }
    const email = normalizedEmail(authoritative?.email);
    if (!authoritative?.emailConfirmed) throw forbidden('Verify your invited email address before accepting this invitation.');
    if (email !== resolved.invitation.email) throw forbidden(unavailableMessage);
    let accepted;
    try {
      accepted = await this.invitationRepository.withTransaction(async (transaction) => {
        const result = await this.invitationRepository.redeem({
          transaction, invitationId: resolved.invitation.id, tokenHash: resolved.tokenHash,
          legacyClaims: resolved.legacyClaims, supabaseUserId: auth.userId, email,
        });
        await this.record(transaction, { ...auth, firmId: result.invitation.firmId }, AUDIT_ACTIONS.INVITATION_ACCEPTED, result.invitation, null, result.invitation, requestContext);
        return result;
      });
    } catch (error) { throw this.redemptionError(error); }
    await this.roleFirmResolver.invalidate(auth.userId);
    return { user: publicMember(accepted.user), firm: { id: accepted.invitation.firmId, name: accepted.invitation.firmName } };
  }

  async resolveToken(token) {
    const tokenHash = hashInvitationToken(token);
    if (tokenHash) {
      const invitation = await this.invitationRepository.findInvitationByTokenHash(tokenHash);
      if (invitation) return { invitation, tokenHash, legacyClaims: null };
    }
    // Existing signed links remain redeemable until expiry, but all newly issued
    // links are opaque and backed by a server-side digest.
    try {
      const legacyClaims = await this.tokenService.verifyInvitationToken(token);
      const invitation = await this.invitationRepository.findInvitationById(legacyClaims.id);
      if (!invitation || invitation.tokenHash) throw new Error('invalid legacy token');
      return { invitation, tokenHash: null, legacyClaims };
    } catch { throw forbidden(unavailableMessage); }
  }

  assertUsable(invitation) {
    if (!invitation) throw forbidden(unavailableMessage);
    if (invitation.status === 'expired') throw gone('EXPIRED_LINK', 'This invitation has expired. Request a new invitation.');
    if (invitation.status !== 'pending') throw gone('EXPIRED_LINK', 'This invitation is unavailable. Request a new invitation.');
  }

  async revokeUndelivered(invitation, auth, requestContext) {
    try {
      await this.invitationRepository.withTransaction(async (transaction) => {
        const changed = await this.invitationRepository.revoke({ transaction, firmId: auth.firmId, actorSupabaseUserId: auth.userId, invitationId: invitation.id });
        await this.record(transaction, auth, AUDIT_ACTIONS.INVITATION_REVOKED, changed.after, changed.before, changed.after, requestContext);
      });
    } catch { /* The original request still fails; no token is ever returned to the browser. */ }
  }

  async record(transaction, auth, action, invitation, before, after, requestContext) {
    return this.auditService.record({
      transaction, requireTransaction: true, firmId: auth.firmId, actorUserId: auth.userId,
      action, entityType: AUDIT_ENTITY_TYPES.INVITATION, entityId: invitation.id,
      beforeState: before ? invitationAuditSnapshot(before) : null,
      afterState: after ? invitationAuditSnapshot(after) : null,
      metadata: { role: invitation.role }, requestContext,
    });
  }

  issueError(error) {
    if (error?.code === 'ADMIN_REQUIRED') return forbidden();
    if (error?.code === 'MEMBER_EXISTS') return conflict('MEMBER_ALREADY_EXISTS', 'This email is already a member of the firm.');
    if (error?.code === 'DUPLICATE_ACTIVE' || error?.code === '23505') return conflict('ACTIVE_INVITATION_EXISTS', 'An active invitation already exists for this email.');
    return error;
  }

  managementError(error) {
    if (error?.code === 'ADMIN_REQUIRED') return forbidden();
    if (error?.code === 'NOT_FOUND') return new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    if (error?.code === 'NOT_PENDING') return conflict('INVITATION_UNAVAILABLE', 'This invitation is no longer pending.');
    return error;
  }

  redemptionError(error) {
    if (error?.code === 'EMAIL_MISMATCH') return forbidden(unavailableMessage);
    if (['INVALID', 'UNAVAILABLE', 'IDENTITY_EXISTS', 'MEMBERSHIP_EXISTS', 'ACCOUNT_RECOVERY_REQUIRED', '23505'].includes(error?.code)) return forbidden(unavailableMessage);
    return error;
  }
}
