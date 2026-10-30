import { verifyToken } from '@clerk/backend';

export class ClerkVerificationError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'ClerkVerificationError';
    this.code = code;
  }
}

function failure(code, message, cause) {
  return new ClerkVerificationError(code, message, cause ? { cause } : undefined);
}

export class ClerkVerifier {
  constructor({
    secretKey,
    publishableKey,
    jwtKey,
    authorizedParties,
  }) {
    if (!secretKey && !jwtKey) {
      throw new TypeError('ClerkVerifier requires a secretKey or jwtKey.');
    }

    this.secretKey = secretKey?.trim();
    this.publishableKey = publishableKey?.trim();
    this.jwtKey = jwtKey?.trim();
    this.authorizedParties = authorizedParties;
  }

  async verifyAccessToken(token) {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw failure('CLERK_TOKEN_MALFORMED', 'Clerk access token is malformed.');
    }

    const options = {};
    if (this.secretKey) options.secretKey = this.secretKey;
    if (this.jwtKey) options.jwtKey = this.jwtKey;
    if (this.authorizedParties) options.authorizedParties = this.authorizedParties;

    let payload;
    try {
      payload = await verifyToken(token.trim(), options);
    } catch (error) {
      const code = error?.code || 'CLERK_TOKEN_INVALID';
      throw failure(code, error?.message || 'Clerk access token is invalid or expired.', error);
    }

    if (!payload || typeof payload !== 'object' || !payload.sub) {
      throw failure('CLERK_TOKEN_SUBJECT_INVALID', 'Clerk access token subject is invalid.');
    }

    return {
      userId: payload.sub,
      email: payload.email ?? payload.primary_email ?? null,
      supabaseRole: 'authenticated', // Aligns with RBAC resolution pipeline
      sessionId: payload.sid ?? null,
      claims: payload,
    };
  }
}
