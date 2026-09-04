import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, badRequest } from '../errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit-taxonomy.js';

const REFERENCE = /^iprp_[0-9a-f]{32}$/;
const SUBSCRIPTION_EVENTS = new Set([
  'subscription.create', 'subscription.not_renew', 'subscription.disable',
  'invoice.payment_failed', 'invoice.update',
]);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const providerCode = (value, prefix) => {
  const normalized = text(value);
  return normalized.startsWith(`${prefix}_`) && normalized.length <= 100 ? normalized : null;
};

export function verifyPaystackSignature(rawBody, signature, secretKey) {
  if (!Buffer.isBuffer(rawBody) || !/^[0-9a-f]{128}$/i.test(text(signature))) return false;
  const supplied = Buffer.from(text(signature).toLowerCase(), 'hex');
  const expected = createHmac('sha512', secretKey).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export class BillingService {
  constructor({ repository, paystackClient, plans, secretKey, callbackUrl, auditService }) {
    this.repository = repository;
    this.paystackClient = paystackClient;
    this.plans = plans;
    this.secretKey = secretKey;
    this.callbackUrl = callbackUrl;
    this.auditService = auditService;
  }

  plan(tier) {
    const plan = this.plans[text(tier)];
    if (!plan) throw badRequest('BILLING_PLAN_INVALID', 'Select a supported billing plan.', { field: 'tier' });
    return plan;
  }

  async initialize(auth, input, requestContext) {
    const plan = this.plan(input?.tier);
    const reference = `iprp_${randomBytes(16).toString('hex')}`;
    const pending = await this.repository.createPending({
      firmId: auth.firmId, actorUserId: auth.userId, reference, plan,
    });
    if (!pending) throw new AppError(403, 'FORBIDDEN', 'Billing requires an active firm Administrator.');
    let checkout;
    try {
      checkout = await this.paystackClient.initializeTransaction({
        email: auth.email,
        amount: String(plan.amountSubunit),
        currency: plan.currency,
        plan: plan.planCode,
        reference,
        callback_url: this.callbackUrl,
        metadata: JSON.stringify({ firm_id: auth.firmId, tier: plan.tier }),
      });
      let checkoutUrl;
      try { checkoutUrl = new URL(checkout.authorization_url); }
      catch { throw new AppError(502, 'PAYSTACK_RESPONSE_INVALID', 'The payment provider returned an invalid checkout destination.'); }
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paystack.com') {
        throw new AppError(502, 'PAYSTACK_RESPONSE_INVALID', 'The payment provider returned an invalid checkout destination.');
      }
    } catch (error) {
      await this.repository.markFailed(reference);
      throw error;
    }
    await this.auditService.record({
      firmId: auth.firmId, actorUserId: pending.initiatedByUserId,
      action: AUDIT_ACTIONS.BILLING_CHECKOUT_INITIALIZED,
      entityType: AUDIT_ENTITY_TYPES.BILLING_TRANSACTION, entityId: pending.id,
      afterState: { tier: plan.tier, reference, status: 'pending' }, requestContext,
    });
    return { authorizationUrl: checkout.authorization_url, reference };
  }

  async summary(auth) {
    const summary = await this.repository.getSummary(auth.firmId);
    return {
      ...summary,
      plans: Object.values(this.plans).map(({ tier, amountSubunit, currency }) => ({
        tier, amountSubunit, currency,
      })),
    };
  }

  validateVerified(expected, data) {
    const metadata = typeof data.metadata === 'string'
      ? (() => { try { return JSON.parse(data.metadata); } catch { return {}; } })()
      : (data.metadata ?? {});
    const valid = data.status === 'success'
      && data.reference === expected.reference
      && Number(data.amount) === expected.amountSubunit
      && data.currency === expected.currency
      && metadata.firm_id === expected.firmId
      && metadata.tier === expected.tier
      && (!expected.initiatedByEmail
        || text(data.customer?.email).toLowerCase() === expected.initiatedByEmail.toLowerCase());
    if (!valid) throw new AppError(409, 'PAYMENT_VERIFICATION_FAILED', 'Payment details did not match the initialized transaction.');
  }

  async verify(auth, input, requestContext) {
    const reference = text(input?.reference);
    if (!REFERENCE.test(reference)) throw badRequest('VALIDATION_ERROR', 'Payment reference is invalid.', { field: 'reference' });
    const expected = await this.repository.findForFirm({ firmId: auth.firmId, reference });
    if (!expected) throw new AppError(404, 'BILLING_TRANSACTION_NOT_FOUND', 'Billing transaction not found.');
    const verified = await this.paystackClient.verifyTransaction(reference);
    this.validateVerified(expected, verified);
    const result = await this.repository.confirmVerifiedPayment({
      reference,
      providerTransactionId: String(verified.id),
      paidAt: verified.paid_at ?? new Date().toISOString(),
      customerCode: providerCode(verified.customer?.customer_code, 'CUS'),
      subscriptionCode: providerCode(verified.subscription?.subscription_code, 'SUB'),
      renewsAt: verified.subscription?.next_payment_date ?? null,
    });
    if (!result.duplicate) await this.auditService.record({
      firmId: auth.firmId, actorUserId: expected.initiatedByUserId,
      action: AUDIT_ACTIONS.BILLING_PAYMENT_CONFIRMED,
      entityType: AUDIT_ENTITY_TYPES.BILLING_TRANSACTION, entityId: expected.id,
      beforeState: { status: expected.status }, afterState: { status: 'paid', tier: expected.tier }, requestContext,
    });
    return this.summary(auth);
  }

  async webhook({ rawBody, signature, event }) {
    if (!verifyPaystackSignature(rawBody, signature, this.secretKey)) {
      throw new AppError(401, 'PAYSTACK_SIGNATURE_INVALID', 'Webhook signature is invalid.');
    }
    const digest = createHash('sha256').update(rawBody).digest('hex');
    // Bound provider-controlled strings before they reach constrained audit
    // storage. Full payloads are deliberately never persisted.
    const eventType = text(event?.event).slice(0, 100);
    const candidateReference = text(event?.data?.reference);
    const reference = candidateReference && candidateReference.length <= 100 ? candidateReference : null;
    if (SUBSCRIPTION_EVENTS.has(eventType)) {
      const subscription = eventType.startsWith('invoice.') ? event?.data?.subscription : event?.data;
      const subscriptionCode = providerCode(subscription?.subscription_code, 'SUB');
      const customerCode = providerCode(event?.data?.customer?.customer_code, 'CUS');
      const planCode = providerCode(subscription?.plan?.plan_code ?? subscription?.plan_code, 'PLN');
      const plan = Object.values(this.plans).find((candidate) => candidate.planCode === planCode);
      if (!subscriptionCode || !customerCode || !plan) {
        await this.repository.recordIgnoredWebhook({ digest, eventType, reference: subscriptionCode });
        return;
      }
      const verified = await this.paystackClient.fetchSubscription(subscriptionCode);
      const verifiedSubscriptionCode = providerCode(verified.subscription_code, 'SUB');
      const verifiedCustomerCode = providerCode(verified.customer?.customer_code, 'CUS');
      const verifiedPlanCode = providerCode(verified.plan?.plan_code, 'PLN');
      if (verifiedSubscriptionCode !== subscriptionCode
        || verifiedCustomerCode !== customerCode
        || verifiedPlanCode !== plan.planCode
        || Number(verified.amount) !== plan.amountSubunit
        || text(verified.plan?.currency).toUpperCase() !== plan.currency) {
        throw new AppError(409, 'PAYMENT_VERIFICATION_FAILED', 'Subscription details did not match the configured plan.');
      }
      const status = eventType === 'subscription.not_renew' ? 'non_renewing'
        : eventType === 'subscription.disable' ? 'cancelled'
          : eventType === 'invoice.payment_failed' ? 'past_due'
            : verified.status === 'attention' ? 'past_due'
              : verified.status === 'non-renewing' ? 'non_renewing'
                : ['cancelled', 'completed'].includes(verified.status) ? 'cancelled' : 'active';
      await this.repository.applySubscriptionEvent({
        digest, eventType, customerCode, subscriptionCode, status,
        renewsAt: verified.next_payment_date ?? null,
      });
      return;
    }
    if (eventType !== 'charge.success' || !reference || !REFERENCE.test(reference)) {
      await this.repository.recordIgnoredWebhook({ digest, eventType: eventType || 'unknown', reference });
      return;
    }
    const metadata = typeof event?.data?.metadata === 'string'
      ? (() => { try { return JSON.parse(event.data.metadata); } catch { return {}; } })()
      : (event?.data?.metadata ?? {});
    const expected = await this.repository.findForFirm({ firmId: metadata.firm_id, reference });
    if (!expected) {
      await this.repository.recordIgnoredWebhook({ digest, eventType, reference });
      return;
    }
    const verified = await this.paystackClient.verifyTransaction(reference);
    this.validateVerified(expected, verified);
    const result = await this.repository.confirmVerifiedPayment({
      reference,
      providerTransactionId: String(verified.id),
      paidAt: verified.paid_at ?? new Date().toISOString(),
      customerCode: providerCode(verified.customer?.customer_code, 'CUS'),
      subscriptionCode: providerCode(verified.subscription?.subscription_code, 'SUB'),
      renewsAt: verified.subscription?.next_payment_date ?? null,
      digest,
    });
    if (!result.duplicate) await this.auditService.record({
      firmId: expected.firmId, actorUserId: expected.initiatedByUserId,
      action: AUDIT_ACTIONS.BILLING_PAYMENT_CONFIRMED,
      entityType: AUDIT_ENTITY_TYPES.BILLING_TRANSACTION, entityId: expected.id,
      beforeState: { status: expected.status }, afterState: { status: 'paid', tier: expected.tier },
      metadata: { source: 'verified_webhook' },
    });
  }
}
