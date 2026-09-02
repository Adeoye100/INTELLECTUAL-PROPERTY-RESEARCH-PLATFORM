import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { BillingService, verifyPaystackSignature } from '../../src/billing/billing-service.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const transactionId = '33333333-3333-4333-8333-333333333333';
const applicationUserId = '44444444-4444-4444-8444-444444444444';
const secretKey = 'sk_test_server_only_example';
const plan = { tier: 'starter', planCode: 'PLN_starter', amountSubunit: 250000, currency: 'NGN' };

function runtime(overrides = {}) {
  const calls = { initialize: [], verify: [], audit: [] };
  const repository = {
    async createPending(input) { calls.pending = input; return { id: transactionId, ...input, initiatedByUserId: applicationUserId, ...plan, status: 'pending' }; },
    async markFailed() {},
    async findForFirm({ reference }) { return { id: transactionId, firmId, reference, ...plan, status: 'pending', initiatedByUserId: applicationUserId, initiatedBySupabaseUserId: userId, initiatedByEmail: 'admin@example.test' }; },
    async confirmVerifiedPayment(input) { calls.confirmed = input; return { duplicate: false }; },
    async getSummary() { return { subscription: { tier: 'starter', status: 'active' }, transactions: [] }; },
    async recordIgnoredWebhook(input) { calls.ignored = input; },
    async applySubscriptionEvent(input) { calls.subscriptionEvent = input; return { duplicate: false, firmId }; },
    ...overrides.repository,
  };
  const paystackClient = {
    async initializeTransaction(input) { calls.initialize.push(input); return { authorization_url: 'https://checkout.paystack.com/test', access_code: 'access' }; },
    async verifyTransaction(reference) {
      calls.verify.push(reference);
      return { id: 42, reference, status: 'success', amount: plan.amountSubunit, currency: plan.currency, metadata: { firm_id: firmId, tier: plan.tier }, customer: { email: 'admin@example.test', customer_code: 'CUS_customer1' }, paid_at: '2026-09-02T00:00:00.000Z' };
    },
    async fetchSubscription() { return { subscription_code: 'SUB_subscription1', status: 'active', amount: plan.amountSubunit, next_payment_date: '2026-10-02T00:00:00.000Z', customer: { customer_code: 'CUS_customer1' }, plan: { plan_code: plan.planCode, currency: plan.currency } }; },
    ...overrides.paystackClient,
  };
  const service = new BillingService({
    repository, paystackClient, plans: { starter: plan }, secretKey,
    callbackUrl: 'https://app.example.test/admin/billing',
    auditService: { async record(input) { calls.audit.push(input); } },
  });
  return { service, calls };
}

describe('Paystack billing security boundary', () => {
  it('accepts only an HMAC-SHA512 signature over the raw request bytes', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac('sha512', secretKey).update(body).digest('hex');
    assert.equal(verifyPaystackSignature(body, signature, secretKey), true);
    assert.equal(verifyPaystackSignature(Buffer.from('{}'), signature, secretKey), false);
    assert.equal(verifyPaystackSignature(body, 'bad', secretKey), false);
  });

  it('ignores client pricing and initializes the configured server-side plan', async () => {
    const { service, calls } = runtime();
    const result = await service.initialize({ firmId, userId, email: 'admin@example.test' }, { tier: 'starter', amount: 1 }, {});
    assert.equal(result.authorizationUrl, 'https://checkout.paystack.com/test');
    assert.equal(calls.initialize[0].amount, String(plan.amountSubunit));
    assert.equal(calls.initialize[0].plan, plan.planCode);
    assert.deepEqual(JSON.parse(calls.initialize[0].metadata), { firm_id: firmId, tier: 'starter' });
    assert.equal(calls.audit[0].actorUserId, applicationUserId);
  });

  it('rejects a provider response that tries to redirect checkout off Paystack', async () => {
    let failedReference;
    const { service } = runtime({
      repository: { async markFailed(reference) { failedReference = reference; } },
      paystackClient: { async initializeTransaction() { return { authorization_url: 'https://attacker.example/checkout' }; } },
    });
    await assert.rejects(
      () => service.initialize({ firmId, userId, email: 'admin@example.test' }, { tier: 'starter' }, {}),
      { code: 'PAYSTACK_RESPONSE_INVALID' },
    );
    assert.match(failedReference, /^iprp_[0-9a-f]{32}$/);
  });

  it('applies a payment only after provider verification matches tenant, amount, currency, and tier', async () => {
    const { service, calls } = runtime();
    const summary = await service.verify({ firmId, userId }, { reference: 'iprp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, {});
    assert.equal(summary.subscription.status, 'active');
    assert.equal(calls.confirmed.providerTransactionId, '42');
    assert.equal(calls.confirmed.customerCode, 'CUS_customer1');
    assert.equal(calls.audit.length, 1);
    assert.equal(calls.audit[0].actorUserId, applicationUserId);
  });

  it('rejects a successful provider response with a mismatched amount', async () => {
    const { service, calls } = runtime({ paystackClient: { async verifyTransaction(reference) {
      return { id: 42, reference, status: 'success', amount: 1, currency: 'NGN', metadata: { firm_id: firmId, tier: 'starter' } };
    } } });
    await assert.rejects(() => service.verify({ firmId, userId }, { reference: 'iprp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }, {}), { code: 'PAYMENT_VERIFICATION_FAILED' });
    assert.equal(calls.confirmed, undefined);
  });

  it('verifies signed subscription lifecycle events before changing tenant status', async () => {
    const event = { event: 'subscription.not_renew', data: {
      subscription_code: 'SUB_subscription1',
      customer: { customer_code: 'CUS_customer1' },
      plan: { plan_code: plan.planCode },
    } };
    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = createHmac('sha512', secretKey).update(rawBody).digest('hex');
    const { service, calls } = runtime();
    await service.webhook({ rawBody, signature, event });
    assert.equal(calls.subscriptionEvent.status, 'non_renewing');
    assert.equal(calls.subscriptionEvent.subscriptionCode, 'SUB_subscription1');
    assert.equal(calls.subscriptionEvent.customerCode, 'CUS_customer1');
  });
});
