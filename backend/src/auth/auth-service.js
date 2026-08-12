import { randomUUID } from 'node:crypto';
import { badRequest, conflict, forbidden, gone } from '../errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['admin', 'attorney', 'viewer']);

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

function publicUser(user) {
  return {
    id: user.id,
    firmId: user.firmId,
    email: user.email,
    role: user.role,
  };
}

export class AuthService {
  constructor({
    userRepository,
    tokenService,
    inviteTokenTtlSeconds = 604_800,
  }) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
    this.inviteTokenTtlSeconds = inviteTokenTtlSeconds;
  }

  async issueInvitation(auth, input) {
    const email = normalizeEmail(input?.email);
    if (!EMAIL_PATTERN.test(email)) {
      throw badRequest('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' });
    }
    const intendedName = String(input?.fullName ?? '').trim().replace(/\s+/g, ' ');
    if (intendedName.length < 2) {
      throw badRequest('VALIDATION_ERROR', 'Full name is required.', { field: 'fullName' });
    }
    const role = String(input?.role ?? '').toLowerCase();
    if (!ROLES.has(role)) {
      throw badRequest('VALIDATION_ERROR', 'Role must be admin, attorney, or viewer.', { field: 'role' });
    }

    const expiresAt = new Date(Date.now() + this.inviteTokenTtlSeconds * 1_000);
    const invitation = await this.userRepository.createInvitation({
      id: randomUUID(),
      issuerUserId: auth?.userId,
      firmId: auth?.firmId,
      email,
      intendedName,
      role,
      expiresAt,
    });
    if (!invitation) throw forbidden('Only a current firm Admin can issue invitations.');

    // BE-16 audit logging belongs here, after the invitation has been persisted.
    return {
      token: await this.tokenService.issueInvitationToken(invitation),
      expiresAt: invitation.expiresAt.getTime(),
      email: invitation.email,
      firmName: invitation.firmName,
      role: invitation.role,
    };
  }

  async invitationDetails(token) {
    const claims = await this.verifyInvitation(token);
    const invitation = await this.userRepository.findInvitation(claims.id);
    this.assertInvitationUsable(invitation, claims);
    return {
      email: invitation.email,
      firmName: invitation.firmName,
      role: invitation.role,
    };
  }

  async acceptInvitation(token, input) {
    const claims = await this.verifyInvitation(token);
    const suppliedEmail = input?.email === undefined ? null : normalizeEmail(input.email);
    if (suppliedEmail !== null && suppliedEmail !== claims.email) {
      throw badRequest('VALIDATION_ERROR', 'Email does not match this invitation.', { field: 'email' });
    }

    let user;
    try {
      user = await this.userRepository.acceptInvitation(claims);
    } catch (error) {
      if (error?.code === 'INVITATION_EXPIRED') {
        throw gone('EXPIRED_LINK', 'This invitation has expired. Request a new invitation.');
      }
      if (error?.code === 'INVITATION_USED') {
        throw gone('EXPIRED_LINK', 'This invitation has already been used. Request a new invitation.');
      }
      if (error?.code === 'INVITATION_INVALID') {
        throw forbidden('This invitation is invalid or unavailable.');
      }
      if (error?.code === '23505' && error?.constraint === 'users_email_key') {
        throw conflict('DUPLICATE_ACCOUNT', 'An account already exists for this email address.');
      }
      throw error;
    }

    // BE-15 redemption rate limiting belongs on the public route. BE-16 audit
    // logging belongs here, after the transaction marks the invitation used.
    return {
      user: {
        ...publicUser(user),
        fullName: String(input?.fullName ?? '').trim().replace(/\s+/g, ' '),
        emailVerified: true,
        onboardingRequired: true,
      },
      firm: user.firm,
    };
  }

  async verifyInvitation(token) {
    if (typeof token !== 'string' || !token) {
      throw forbidden('This invitation is invalid or unavailable.');
    }
    try {
      return await this.tokenService.verifyInvitationToken(token);
    } catch (error) {
      if (error?.code === 'ERR_JWT_EXPIRED') {
        throw gone('EXPIRED_LINK', 'This invitation has expired. Request a new invitation.');
      }
      throw forbidden('This invitation is invalid or unavailable.');
    }
  }

  assertInvitationUsable(invitation, claims) {
    if (!invitation) throw forbidden('This invitation is invalid or unavailable.');
    if (invitation.usedAt) {
      throw gone('EXPIRED_LINK', 'This invitation has already been used. Request a new invitation.');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw gone('EXPIRED_LINK', 'This invitation has expired. Request a new invitation.');
    }
    if (
      invitation.firmId !== claims.firmId
      || invitation.email !== claims.email
      || invitation.role !== claims.role
      || Math.floor(invitation.expiresAt.getTime() / 1_000) !== claims.expiresAtSeconds
    ) {
      throw forbidden('This invitation is invalid or unavailable.');
    }
  }

}
