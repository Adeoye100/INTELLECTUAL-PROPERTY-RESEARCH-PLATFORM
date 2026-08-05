import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from '../../src/auth/auth-service.js';

function createService(overrides = {}) {
  const dependencies = {
    userRepository: {
      async createWithFirm(input) {
        return {
          id: 'user-1',
          firmId: 'firm-1',
          email: input.email,
          role: 'admin',
          firm: { id: 'firm-1', name: input.firmName, subscriptionTier: 'free' },
        };
      },
      async findByEmail() { return null; },
      async findById() { return null; },
      async recordLogin() { return new Date(); },
    },
    passwordHasher: {
      async hash() { return 'argon2-hash'; },
      async verify() { return false; },
      async verifyDummy() {},
    },
    tokenService: {
      async issueAccessToken() { return 'access-token'; },
    },
    sessionStore: {
      async create() { return 'refresh-token'; },
      async rotate() { return null; },
      async invalidate() {},
    },
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 2_592_000,
    ...overrides,
  };
  return new AuthService(dependencies);
}

describe('AuthService', () => {
  it('normalizes signup identity without passing plaintext to persistence', async () => {
    let persisted;
    const service = createService({
      userRepository: {
        async createWithFirm(input) {
          persisted = input;
          return {
            id: 'user-1', firmId: 'firm-1', email: input.email, role: 'admin',
            firm: { id: 'firm-1', name: input.firmName, subscriptionTier: 'free' },
          };
        },
      },
    });

    const result = await service.signup({
      firmName: '  Forge   Legal ',
      email: ' ADA@EXAMPLE.TEST ',
      password: 'private-password',
    });

    assert.equal(result.user.role, 'admin');
    assert.deepEqual(persisted, {
      firmName: 'Forge Legal',
      normalizedFirmName: 'forge legal',
      email: 'ada@example.test',
      passwordHash: 'argon2-hash',
    });
    assert.equal(JSON.stringify(persisted).includes('private-password'), false);
  });

  it('uses the generic credential error and dummy hash path for an unknown account', async () => {
    let checkedDummy = false;
    const service = createService({
      passwordHasher: {
        async hash() { return 'unused'; },
        async verify() { return false; },
        async verifyDummy() { checkedDummy = true; },
      },
    });

    await assert.rejects(
      service.login({ email: 'missing@example.test', password: 'private-password' }),
      (error) => error.status === 401 && error.message === 'Email or password is incorrect.',
    );
    assert.equal(checkedDummy, true);
  });

  it('rejects invalid refresh sessions', async () => {
    const service = createService();
    await assert.rejects(
      service.refresh({ refreshToken: 'unknown-token' }),
      (error) => error.status === 401 && error.code === 'UNAUTHORIZED',
    );
  });
});
