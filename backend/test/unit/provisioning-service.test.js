import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProvisioningService } from '../../src/auth/provisioning-service.js';

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: ' ADA@EXAMPLE.TEST ',
  supabaseRole: 'authenticated',
};

describe('ProvisioningService', () => {
  it('creates and immediately links an Admin membership from verified identity data', async () => {
    let persisted;
    let invalidated;
    const service = new ProvisioningService({
      userRepository: {
        async createFirmForSupabaseIdentity(input) {
          persisted = input;
          return {
            id: 'local-user', firmId: 'firm-1', email: input.email, role: 'admin',
            firm: { id: 'firm-1', name: input.firmName, subscriptionTier: 'free' },
          };
        },
      },
      roleFirmResolver: {
        async invalidate(userId) { invalidated = userId; },
      },
    });

    const result = await service.provisionFirm(identity, { firmName: '  Forge   Legal  ' });

    assert.deepEqual(persisted, {
      firmName: 'Forge Legal',
      normalizedFirmName: 'forge legal',
      email: 'ada@example.test',
      supabaseUserId: identity.userId,
    });
    assert.equal(invalidated, identity.userId);
    assert.equal(result.user.role, 'admin');
    assert.equal(result.firm.name, 'Forge Legal');
  });

  it('rejects an identity that is not a verified authenticated Supabase user', async () => {
    const service = new ProvisioningService({
      userRepository: { createFirmForSupabaseIdentity: async () => assert.fail('must not persist') },
      roleFirmResolver: { invalidate: async () => {} },
    });

    await assert.rejects(
      service.provisionFirm({ ...identity, supabaseRole: 'service_role' }, { firmName: 'Forge' }),
      (error) => error.status === 403,
    );
  });
});
