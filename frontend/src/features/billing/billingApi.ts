import { getApiClient } from '../../lib/api/client';

export interface BillingPlan {
  tier: 'starter' | 'professional';
  amountSubunit: number;
  currency: string;
}

export interface BillingTransaction {
  id: string;
  firmId: string;
  reference: string;
  tier: string;
  amountSubunit: number;
  currency: string;
  status: string;
  paidAt: string | null;
}

export interface BillingSubscription {
  tier: string;
  status: string;
  provider: string | null;
  renewsAt: string | null;
}

export interface BillingSummary {
  enabled?: boolean;
  subscription: BillingSubscription | null;
  transactions: BillingTransaction[];
  plans: BillingPlan[];
}

export interface BillingCheckoutResponse {
  authorizationUrl: string;
  reference: string;
}

export const getBillingSummary = () => {
  return getApiClient().requestJson<BillingSummary>('/billing');
};

export const initializeBillingCheckout = (tier: 'starter' | 'professional') => {
  return getApiClient().requestJson<BillingCheckoutResponse>('/billing/checkout', {
    method: 'POST',
    body: { tier },
  });
};

export const verifyBillingPayment = (reference: string) => {
  return getApiClient().requestJson<BillingSummary>('/billing/verify', {
    method: 'POST',
    body: { reference },
  });
};
