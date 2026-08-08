import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export class TokenService {
  constructor({ secret, issuer, audience, accessTokenTtlSeconds }) {
    this.secret = new TextEncoder().encode(secret);
    this.issuer = issuer;
    this.audience = audience;
    this.accessTokenTtlSeconds = accessTokenTtlSeconds;
  }

  async issueAccessToken(user) {
    return new SignJWT({
      type: 'access',
      firmId: user.firmId,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenTtlSeconds}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(token) {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['HS256'],
    });

    if (
      payload.type !== 'access'
      || typeof payload.sub !== 'string'
      || typeof payload.firmId !== 'string'
      || typeof payload.email !== 'string'
      || !['admin', 'attorney', 'viewer'].includes(payload.role)
    ) {
      throw new Error('Invalid access-token claims.');
    }

    return {
      userId: payload.sub,
      firmId: payload.firmId,
      email: payload.email,
      role: payload.role,
    };
  }

  async issueInvitationToken(invitation) {
    return new SignJWT({
      type: 'firm-invitation',
      firmId: invitation.firmId,
      email: invitation.email,
      role: invitation.role,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setJti(invitation.id)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(Math.floor(invitation.expiresAt.getTime() / 1_000))
      .sign(this.secret);
  }

  async verifyInvitationToken(token) {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['HS256'],
    });

    if (
      payload.type !== 'firm-invitation'
      || typeof payload.jti !== 'string'
      || typeof payload.firmId !== 'string'
      || typeof payload.email !== 'string'
      || !['admin', 'attorney', 'viewer'].includes(payload.role)
      || typeof payload.exp !== 'number'
    ) {
      throw new Error('Invalid invitation-token claims.');
    }

    return {
      id: payload.jti,
      firmId: payload.firmId,
      email: payload.email,
      role: payload.role,
      expiresAtSeconds: payload.exp,
    };
  }
}
