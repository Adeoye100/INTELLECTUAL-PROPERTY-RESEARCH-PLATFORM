import { SignJWT, jwtVerify } from 'jose';

export class TokenService {
  constructor({ secret, inviteTokenTtlSeconds = 604_800 }) {
    if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new TypeError('TokenService needs a secret of at least 32 bytes.');
    }
    this.secret = new TextEncoder().encode(secret);
    this.inviteTokenTtlSeconds = inviteTokenTtlSeconds;
  }

  async issueInvitationToken(invitation) {
    return new SignJWT({
      id: invitation.id,
      firmId: invitation.firmId,
      email: invitation.email,
      role: invitation.role,
      expiresAtSeconds: Math.floor(invitation.expiresAt.getTime() / 1_000),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(invitation.expiresAt)
      .sign(this.secret);
  }

  async verifyInvitationToken(token) {
    const { payload } = await jwtVerify(token, this.secret);
    return {
      id: payload.id,
      firmId: payload.firmId,
      email: payload.email,
      role: payload.role,
      expiresAtSeconds: payload.expiresAtSeconds,
    };
  }
}
