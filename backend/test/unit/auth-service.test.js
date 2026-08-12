import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from '../../src/auth/auth-service.js';

const invitation = {
  id: 'invite-1',
  firmId: 'firm-1',
  email: 'viewer@example.test',
  role: 'viewer',
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  firmName: 'Forge Legal',
};

function createService(overrides = {}) {
  const dependencies = {
    userRepository: {
      async findInvitation() { return invitation; },
      async acceptInvitation(input) {
        return {
          id: 'user-1', firmId: input.firmId, email: input.email, role: input.role,
          firm: { id: input.firmId, name: invitation.firmName, subscriptionTier: 'free' },
        };
      },
    },
    tokenService: {
      async verifyInvitationToken() {
        return {
          id: invitation.id,
          firmId: invitation.firmId,
          email: invitation.email,
          role: invitation.role,
          expiresAtSeconds: Math.floor(invitation.expiresAt.getTime() / 1_000),
        };
      },
    },
    inviteTokenTtlSeconds: 604_800,
    ...overrides,
  };
  return new AuthService(dependencies);
}

describe('AuthService invitation provisioning', () => {
  it('accepts a signed invitation without persisting a local password credential', async () => {
    let persisted;
    const service = createService({
      userRepository: {
        async acceptInvitation(input) {
          persisted = input;
          return {
            id: 'user-1', firmId: input.firmId, email: input.email, role: input.role,
            firm: { id: input.firmId, name: invitation.firmName, subscriptionTier: 'free' },
          };
        },
      },
    });

    const result = await service.acceptInvitation('signed-invitation', {
      fullName: '  Invited   Viewer ',
      password: 'must-not-reach-persistence',
    });

    assert.deepEqual(persisted, {
      id: invitation.id,
      firmId: invitation.firmId,
      email: invitation.email,
      role: invitation.role,
      expiresAtSeconds: Math.floor(invitation.expiresAt.getTime() / 1_000),
    });
    assert.equal(JSON.stringify(persisted).includes('password'), false);
    assert.equal(result.user.fullName, 'Invited Viewer');
    assert.equal(result.user.role, 'viewer');
  });
});
