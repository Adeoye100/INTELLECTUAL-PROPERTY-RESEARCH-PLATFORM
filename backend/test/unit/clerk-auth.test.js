import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClerkVerifier, ClerkVerificationError } from '../../src/auth/clerk-verifier.js';
import { ClerkAdminUserService } from '../../src/auth/clerk-admin-user-service.js';

describe('ClerkVerifier', () => {
  it('requires secretKey or jwtKey', () => {
    assert.throws(() => new ClerkVerifier({}), /requires a secretKey or jwtKey/);
  });

  it('rejects malformed or empty tokens', async () => {
    const verifier = new ClerkVerifier({ secretKey: 'sk_test_mock' });
    await assert.rejects(
      verifier.verifyAccessToken(''),
      (err) => err instanceof ClerkVerificationError && err.code === 'CLERK_TOKEN_MALFORMED',
    );
    await assert.rejects(
      verifier.verifyAccessToken('not.a.valid.jwt'),
      (err) => err instanceof ClerkVerificationError,
    );
  });
});

describe('ClerkAdminUserService', () => {
  it('requires secretKey or clerkClient', () => {
    assert.throws(() => new ClerkAdminUserService({}), /requires secretKey or clerkClient/);
  });

  it('validates user ID format', async () => {
    const service = new ClerkAdminUserService({ secretKey: 'sk_test_mock' });
    await assert.rejects(
      service.getAuthoritativeUser(''),
      (err) => err.code === 'CLERK_ADMIN_USER_ID_INVALID',
    );
  });

  it('retrieves and normalizes authoritative user email and verified status', async () => {
    const mockClerkClient = {
      users: {
        async getUser(id) {
          assert.equal(id, 'user_12345');
          return {
            id,
            primaryEmailAddressId: 'email_primary',
            emailAddresses: [
              { id: 'email_primary', emailAddress: 'attorney@example.test', verification: { status: 'verified' } },
              { id: 'email_secondary', emailAddress: 'personal@example.test', verification: { status: 'unverified' } },
            ],
          };
        },
      },
    };

    const service = new ClerkAdminUserService({ clerkClient: mockClerkClient });
    const user = await service.getAuthoritativeUser('user_12345');
    assert.deepEqual(user, {
      email: 'attorney@example.test',
      emailConfirmed: true,
    });
  });

  it('reports unverified email correctly', async () => {
    const mockClerkClient = {
      users: {
        async getUser(id) {
          return {
            id,
            primaryEmailAddressId: 'email_unverified',
            emailAddresses: [
              { id: 'email_unverified', emailAddress: 'unverified@example.test', verification: { status: 'pending' } },
            ],
          };
        },
      },
    };

    const service = new ClerkAdminUserService({ clerkClient: mockClerkClient });
    const user = await service.getAuthoritativeUser('user_999');
    assert.deepEqual(user, {
      email: 'unverified@example.test',
      emailConfirmed: false,
    });
  });
});
