import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvitationService } from '../../src/auth/invitation-service.js';
import { FakeInvitationMailer } from '../../src/auth/invitation-mailer.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const invitationId = '33333333-3333-4333-8333-333333333333';
const auth = { firmId, userId: actorId, supabaseRole: 'authenticated' };

function pendingInvitation(overrides = {}) {
  return {
    id: invitationId, firmId, email: 'invitee@iprp.test', intendedName: 'Invited User', role: 'viewer',
    expiresAt: new Date(Date.now() + 60_000), usedAt: null, acceptedAt: null, revokedAt: null,
    supersededBy: null, lastSentAt: null, firmName: 'Forge Legal', issuerEmail: 'admin@iprp.test',
    tokenHash: 'a'.repeat(64), status: 'pending', ...overrides,
  };
}

function service({ invitation = pendingInvitation(), authoritative = { email: 'invitee@iprp.test', emailConfirmed: true } } = {}) {
  const calls = { issue: [], redeem: 0, invalidated: [] };
  const mailer = new FakeInvitationMailer({ applicationUrl: 'https://intellectual-property-research-plat.vercel.app' });
  const repository = {
    async withTransaction(work) { return work({}); },
    async issue(input) { calls.issue.push(input); return pendingInvitation({ role: input.role, email: input.email, intendedName: input.intendedName }); },
    async findInvitationByTokenHash() { return invitation; },
    async redeem() { calls.redeem += 1; return { invitation, user: { id: invitationId, email: invitation.email, role: invitation.role, status: 'active', lastLoginAt: null } }; },
  };
  return { calls, mailer, instance: new InvitationService({
    invitationRepository: repository, tokenService: { async verifyInvitationToken() { throw new Error('opaque token expected'); } },
    invitationMailer: mailer, auditService: { async record() { return {}; } },
    roleFirmResolver: { async invalidate(id) { calls.invalidated.push(id); } },
    supabaseAdminUserService: { async getAuthoritativeUser() { return authoritative; } }, inviteTokenTtlSeconds: 60,
  }) };
}

describe('InvitationService authenticated redemption', () => {
  it('issues each permitted role, sends a safe link, and never returns token material', async () => {
    const fixture = service();
    for (const role of ['viewer', 'attorney', 'admin']) {
      const result = await fixture.instance.issue(auth, { fullName: 'Invited User', email: 'invitee@iprp.test', role });
      assert.equal(result.invitation.role, role);
      assert.equal('token' in result.invitation, false);
    }
    assert.deepEqual(fixture.calls.issue.map((entry) => entry.role), ['viewer', 'attorney', 'admin']);
    assert.equal(fixture.mailer.messages.length, 3);
    assert.equal(fixture.mailer.messages[0].html.includes("https://intellectual-property-research-plat.vercel.app/auth/invite/"), true);
    assert.equal(fixture.mailer.messages[0].html.includes('SUPABASE_SECRET_KEY'), false);
  });

  it('validates without consuming, then redeems only a confirmed matching Supabase identity', async () => {
    const fixture = service();
    const token = 'x'.repeat(48);
    const details = await fixture.instance.invitationDetails(token);
    assert.deepEqual(details.email, 'invitee@iprp.test');
    assert.equal(fixture.calls.redeem, 0);
    const result = await fixture.instance.redeem(token, auth);
    assert.equal(result.user.role, 'viewer');
    assert.equal(fixture.calls.redeem, 1);
    assert.deepEqual(fixture.calls.invalidated, [actorId]);
  });

  it('does not consume when the confirmed identity email is mismatched or unconfirmed', async () => {
    for (const authoritative of [
      { email: 'other@iprp.test', emailConfirmed: true },
      { email: 'invitee@iprp.test', emailConfirmed: false },
    ]) {
      const fixture = service({ authoritative });
      await assert.rejects(fixture.instance.redeem('x'.repeat(48), auth), (error) => error.status === 403);
      assert.equal(fixture.calls.redeem, 0);
    }
  });

  it('rejects expired, revoked, accepted, and superseded invitations before redemption', async () => {
    for (const invitation of [
      pendingInvitation({ status: 'expired', expiresAt: new Date(Date.now() - 1) }),
      pendingInvitation({ status: 'revoked', revokedAt: new Date() }),
      pendingInvitation({ status: 'accepted', usedAt: new Date() }),
      pendingInvitation({ status: 'superseded', supersededBy: actorId }),
    ]) {
      const fixture = service({ invitation });
      await assert.rejects(fixture.instance.redeem('x'.repeat(48), auth));
      assert.equal(fixture.calls.redeem, 0);
    }
  });
});
