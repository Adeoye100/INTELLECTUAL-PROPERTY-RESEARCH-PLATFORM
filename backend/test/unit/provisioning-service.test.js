import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProvisioningService } from '../../src/auth/provisioning-service.js';

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'ADA@EXAMPLE.TEST',
  supabaseRole: 'authenticated',
};
const intentToken = 'a'.repeat(48);

describe('ProvisioningService', () => {
  it('creates the first Admin only from a matching confirmed organization intent', async () => {
    let persisted;
    let invalidated;
    const service = new ProvisioningService({
      organizationProvisioningRepository: {
        async createFirmFromIntent(input) {
          persisted = input;
          return { id: 'local-user', firmId: 'firm-1', email: input.email, role: 'admin', firm: { id: 'firm-1', name: 'Forge Legal', subscriptionTier: 'free' } };
        },
      },
      roleFirmResolver: { async invalidate(userId) { invalidated = userId; } },
      supabaseAdminUserService: { async getAuthoritativeUser() { return { email: 'ada@example.test', emailConfirmed: true }; } },
      firmSignupEnabled: true,
    });

    const result = await service.provisionFirm(identity, { intentToken });

    assert.equal(persisted.email, 'ada@example.test');
    assert.equal(persisted.supabaseUserId, identity.userId);
    assert.match(persisted.tokenHash, /^[0-9a-f]{64}$/);
    assert.equal(invalidated, identity.userId);
    assert.equal(result.user.role, 'admin');
    assert.equal(result.firm.name, 'Forge Legal');
  });

  it('rejects ordinary provisioning when public organization creation is disabled', async () => {
    const service = new ProvisioningService({
      organizationProvisioningRepository: { async createFirmFromIntent() { assert.fail('must not persist'); } },
      roleFirmResolver: { async invalidate() {} },
      supabaseAdminUserService: { async getAuthoritativeUser() { assert.fail('must not verify'); } },
      firmSignupEnabled: false,
    });
    await assert.rejects(service.provisionFirm(identity, { intentToken }), (error) => error.status === 403);
  });

  it('rejects an unconfirmed or mismatched Supabase identity before writing a firm', async () => {
    const service = new ProvisioningService({
      organizationProvisioningRepository: { async createFirmFromIntent() { assert.fail('must not persist'); } },
      roleFirmResolver: { async invalidate() {} },
      supabaseAdminUserService: { async getAuthoritativeUser() { return { email: 'other@example.test', emailConfirmed: false }; } },
      firmSignupEnabled: true,
    });
    await assert.rejects(service.provisionFirm(identity, { intentToken }), (error) => error.status === 403);
  });
});
