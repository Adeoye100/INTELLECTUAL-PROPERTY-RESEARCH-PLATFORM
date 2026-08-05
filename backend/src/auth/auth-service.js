import { badRequest, conflict, unauthorized } from '../errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  constructor({ userRepository, passwordHasher, tokenService, sessionStore, accessTokenTtlSeconds, refreshTokenTtlSeconds }) {
    this.userRepository = userRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
    this.sessionStore = sessionStore;
    this.accessTokenTtlSeconds = accessTokenTtlSeconds;
    this.refreshTokenTtlSeconds = refreshTokenTtlSeconds;
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
