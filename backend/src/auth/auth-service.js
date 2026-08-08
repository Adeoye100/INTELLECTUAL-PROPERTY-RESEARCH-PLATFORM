import { randomUUID } from 'node:crypto';
import { badRequest, conflict, forbidden, gone, unauthorized } from '../errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['admin', 'attorney', 'viewer']);

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const normalizeFirmName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const displayFirmName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw badRequest('VALIDATION_ERROR', 'Password must be at least 8 characters.', {
      field: 'password',
    });
  }
}

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
    passwordHasher,
    tokenService,
    sessionStore,
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    inviteTokenTtlSeconds = 604_800,
  }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
    this.sessionStore = sessionStore;
    this.accessTokenTtlSeconds = accessTokenTtlSeconds;
    this.refreshTokenTtlSeconds = refreshTokenTtlSeconds;
    this.inviteTokenTtlSeconds = inviteTokenTtlSeconds;
  }

  validateCredentialsInput(input) {
    const email = normalizeEmail(input?.email);
    if (!EMAIL_PATTERN.test(email)) {
      throw badRequest('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' });
    }
    validatePassword(input?.password);
    return { email, password: input.password };
  }

  async issueTokenPair(user) {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.issueAccessToken(user),
      this.sessionStore.create(user),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresIn: this.refreshTokenTtlSeconds,
      user: publicUser(user),
    };
  }

  async signup(input) {
    if (input?.inviteToken !== undefined) {
      if (typeof input.inviteToken !== 'string' || !input.inviteToken) {
        throw badRequest('VALIDATION_ERROR', 'Invitation token is required.', { field: 'inviteToken' });
      }
      return this.acceptInvitation(input.inviteToken, input);
    }

    const { email, password } = this.validateCredentialsInput(input);
    const firmName = displayFirmName(input?.firmName ?? input?.company);
    const normalizedFirmName = normalizeFirmName(firmName);
    if (firmName.length < 2) {
      throw badRequest('VALIDATION_ERROR', 'Firm name is required.', { field: 'firmName' });
    }

    const passwordHash = await this.passwordHasher.hash(password);
    let user;
    try {
      user = await this.userRepository.createWithFirm({
        firmName,
        normalizedFirmName,
        email,
        passwordHash,
      });
    } catch (error) {
      if (error?.code === 'FIRM_NAME_EXISTS') {
        throw conflict(
          'FIRM_ALREADY_EXISTS',
          'This firm may already exist. Request an invitation from your firm administrator.',
        );
      }
      if (error?.code === '23505' && error?.constraint === 'users_email_key') {
        throw conflict('DUPLICATE_ACCOUNT', 'An account already exists for this email address.');
      }
      throw error;
    }

    return {
      ...(await this.issueTokenPair(user)),
      firm: user.firm,
    };
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
    validatePassword(input?.password);
    const claims = await this.verifyInvitation(token);
    const suppliedEmail = input?.email === undefined ? null : normalizeEmail(input.email);
    if (suppliedEmail !== null && suppliedEmail !== claims.email) {
      throw badRequest('VALIDATION_ERROR', 'Email does not match this invitation.', { field: 'email' });
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    let user;
    try {
      user = await this.userRepository.acceptInvitation({ ...claims, passwordHash });
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
    const session = await this.issueTokenPair(user);
    return {
      ...session,
      token: session.accessToken,
      expiresAt: Date.now() + this.accessTokenTtlSeconds * 1_000,
      user: {
        ...session.user,
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

  async login(input) {
    const { email, password } = this.validateCredentialsInput(input);
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      await this.passwordHasher.verifyDummy(password);
      throw unauthorized('Email or password is incorrect.');
    }

    const valid = await this.passwordHasher.verify(user.passwordHash, password);
    if (!valid) throw unauthorized('Email or password is incorrect.');

    user.lastLoginAt = await this.userRepository.recordLogin(user.id);
    return {
      ...(await this.issueTokenPair(user)),
      firm: user.firm,
    };
  }

  async refresh(input) {
    const refreshToken = input?.refreshToken;
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw badRequest('VALIDATION_ERROR', 'Refresh token is required.', { field: 'refreshToken' });
    }

    const rotated = await this.sessionStore.rotate(refreshToken);
    if (!rotated) throw unauthorized('Refresh session is invalid or expired.');

    const user = await this.userRepository.findById(rotated.userId);
    if (!user) {
      await this.sessionStore.invalidate(rotated.refreshToken);
      throw unauthorized('Refresh session is invalid or expired.');
    }

    return {
      accessToken: await this.tokenService.issueAccessToken(user),
      refreshToken: rotated.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresIn: this.refreshTokenTtlSeconds,
      user: publicUser(user),
    };
  }

  async logout(input) {
    const refreshToken = input?.refreshToken;
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw badRequest('VALIDATION_ERROR', 'Refresh token is required.', { field: 'refreshToken' });
    }
    await this.sessionStore.invalidate(refreshToken);
  }
}
