import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TokenService } from '../../src/auth/token-service.js';

const createTokenService = () => new TokenService({
  secret: 'unit-test-secret-that-is-at-least-32-bytes',
  issuer: 'iprp-unit-test',
  audience: 'iprp-unit-client',
  accessTokenTtlSeconds: 900,
});

describe('firm invitation tokens', () => {
  it('signs and verifies the invitation identity, firm, email, role, and expiry', async () => {
    const service = createTokenService();
    const expiresAt = new Date(Date.now() + 60_000);
    const token = await service.issueInvitationToken({
      id: 'invite-1',
      firmId: 'firm-1',
      email: 'invited@example.test',
      role: 'attorney',
      expiresAt,
    });

    assert.deepEqual(await service.verifyInvitationToken(token), {
      id: 'invite-1',
      firmId: 'firm-1',
      email: 'invited@example.test',
      role: 'attorney',
      expiresAtSeconds: Math.floor(expiresAt.getTime() / 1_000),
    });
  });

  it('rejects tampering and cryptographically expired invitations', async () => {
    const service = createTokenService();
    const token = await service.issueInvitationToken({
      id: 'invite-2',
      firmId: 'firm-1',
      email: 'invited@example.test',
      role: 'viewer',
      expiresAt: new Date(Date.now() - 1_000),
    });

    const parts = token.split('.');
    parts[2] = `${parts[2][0] === 'a' ? 'b' : 'a'}${parts[2].slice(1)}`;
    await assert.rejects(service.verifyInvitationToken(parts.join('.')));
    await assert.rejects(
      service.verifyInvitationToken(token),
      (error) => error.code === 'ERR_JWT_EXPIRED',
    );
  });
});
