import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ApiError } from '../../lib/api/client';
import {
  getBillingSummary,
  initializeBillingCheckout,
  verifyBillingPayment,
  type BillingPlan,
  type BillingSummary,
} from './billingApi';

const currencyAmount = ({ amountSubunit, currency }: { amountSubunit: number; currency: string }) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountSubunit / 100);

function mapErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const code = err.serverCode || String(err.code);
    if (code === 'BILLING_PLAN_INVALID') return 'That subscription plan is unavailable.';
    if (code === 'PAYMENT_VERIFICATION_FAILED') return 'Payment verification did not match the initialized transaction.';
    if (code === 'BILLING_TRANSACTION_NOT_FOUND') return 'The payment reference could not be found.';
    if (err.message && !err.message.includes('HTTP error')) return err.message;
  }
  return fallback;
}

export function AdminScreen() {
  const [params, setParams] = useSearchParams();
  const [callbackReference] = useState(() => params.get('reference') ?? params.get('trxref'));
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTier, setBusyTier] = useState<string | null>(callbackReference ? 'verify' : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getBillingSummary());
    } catch (err) {
      setError(mapErrorMessage(err, 'Billing information could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = callbackReference
      ? verifyBillingPayment(callbackReference)
      : getBillingSummary();

    request
      .then((next) => {
        setSummary(next);
        if (callbackReference) setNotice('Payment verified and subscription activated.');
      })
      .catch((err) => {
        setError(callbackReference
          ? mapErrorMessage(err, 'Payment could not be verified yet. No subscription change was applied.')
          : mapErrorMessage(err, 'Billing information could not be loaded.'));
      })
      .finally(() => {
        setLoading(false);
        setBusyTier(null);
        if (callbackReference) setParams({}, { replace: true });
      });
  }, [callbackReference, setParams]);

  const checkout = async (tier: 'starter' | 'professional') => {
    setBusyTier(tier);
    setError(null);
    setNotice(null);
    try {
      const result = await initializeBillingCheckout(tier);
      const url = new URL(result.authorizationUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') {
        throw new Error('Unsafe checkout URL returned by provider');
      }
      window.location.assign(url.toString());
    } catch (err) {
      setError(mapErrorMessage(err, 'Checkout could not be started. Please try again.'));
      setBusyTier(null);
    }
  };

  if (loading) return <p role="status" className="p-6 text-muted-foreground">Loading billing…</p>;

  const currentTier = summary?.subscription?.tier;
  const isSubscriptionActive = summary?.subscription?.status === 'active';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Only firm Administrators can view or change the subscription.</p>
      </header>

      {notice && (
        <p role="status" className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-foreground">
          {notice}
        </p>
      )}

      {error && (
        <div role="alert" className="rounded border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      <Card title="Current subscription" className="border-none bg-forge-navy-950 text-white dark:bg-card dark:text-card-foreground dark:border dark:border-border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm opacity-80">Plan</p>
            <p className="flex items-center gap-2 text-2xl font-black capitalize">
              {summary?.subscription?.tier ?? 'free'} <ShieldCheck aria-hidden="true" className="w-6 h-6 text-emerald-400" />
            </p>
          </div>
          <div>
            <p className="text-sm opacity-80">Status</p>
            <p className="font-bold capitalize">{summary?.subscription?.status ?? 'inactive'}</p>
          </div>
          {summary?.subscription?.renewsAt && (
            <div>
              <p className="text-sm opacity-80">Renews At</p>
              <p className="font-medium text-sm">{new Date(summary.subscription.renewsAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </Card>

      <section aria-labelledby="plans-title">
        <h2 id="plans-title" className="text-xl font-bold text-foreground">Available plans</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {summary?.plans.map((plan: BillingPlan) => {
            const isCurrent = currentTier === plan.tier && isSubscriptionActive;
            return (
              <Card key={plan.tier} title={plan.tier[0].toUpperCase() + plan.tier.slice(1)}>
                <p className="text-2xl font-black text-foreground">{currencyAmount(plan)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Checkout is completed on Paystack. The server verifies payment before enabling the plan.
                </p>
                <Button
                  className="mt-4 w-full"
                  disabled={busyTier !== null || isCurrent}
                  onClick={() => void checkout(plan.tier)}
                >
                  <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isCurrent
                    ? 'Current plan'
                    : busyTier === plan.tier
                      ? 'Opening checkout…'
                      : `Choose ${plan.tier}`}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="text-xl font-bold text-foreground">Recent transactions</h2>
        {summary?.transactions.length ? (
          <ul className="mt-3 space-y-2">
            {summary.transactions.map((transaction) => (
              <li key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card text-card-foreground p-3 text-sm">
                <span className="capitalize font-medium">{transaction.tier} · {transaction.status}</span>
                <span className="font-semibold">{currencyAmount(transaction)}</span>
                <span className="font-mono text-xs text-muted-foreground">{transaction.reference}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No transactions yet.</p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Forge Global never stores card or bank credentials. Paystack processes payment details; this application stores only transaction references and subscription state.
      </p>
    </div>
  );
}
