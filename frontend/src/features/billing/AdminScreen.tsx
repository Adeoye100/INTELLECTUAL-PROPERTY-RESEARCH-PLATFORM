import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { getApiClient } from '../../lib/api/client';

interface BillingTransaction { id: string; reference: string; tier: string; amountSubunit: number; currency: string; status: string; paidAt: string | null; }
interface BillingPlan { tier: 'starter' | 'professional'; amountSubunit: number; currency: string; }
interface BillingSummary { subscription: { tier: string; status: string; provider: string | null; renewsAt: string | null } | null; transactions: BillingTransaction[]; plans: BillingPlan[]; }

const currencyAmount = ({ amountSubunit, currency }: { amountSubunit: number; currency: string }) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency,
}).format(amountSubunit / 100);

export function AdminScreen() {
  const [params, setParams] = useSearchParams();
  const [callbackReference] = useState(() => params.get('reference') ?? params.get('trxref'));
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTier, setBusyTier] = useState<string | null>(callbackReference ? 'verify' : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSummary(await getApiClient().requestJson<BillingSummary>('/billing')); }
    catch { setError('Billing information could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const request = callbackReference
      ? getApiClient().requestJson<BillingSummary>('/billing/verify', {
        method: 'POST', body: { reference: callbackReference },
      })
      : getApiClient().requestJson<BillingSummary>('/billing');
    request
      .then((next) => {
        setSummary(next);
        if (callbackReference) setNotice('Payment verified and subscription activated.');
      })
      .catch(() => setError(callbackReference
        ? 'Payment could not be verified. No subscription change was applied.'
        : 'Billing information could not be loaded.'))
      .finally(() => {
        setLoading(false);
        setBusyTier(null);
        if (callbackReference) setParams({}, { replace: true });
      });
  }, [callbackReference, setParams]);
  const checkout = async (tier: 'starter' | 'professional') => {
    setBusyTier(tier); setError(null); setNotice(null);
    try {
      const result = await getApiClient().requestJson<{ authorizationUrl: string }>('/billing/checkout', { method: 'POST', body: { tier } });
      const url = new URL(result.authorizationUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Unsafe checkout URL');
      window.location.assign(url.toString());
    } catch { setError('Checkout could not be started. Please try again.'); setBusyTier(null); }
  };
  if (loading) return <p role="status">Loading billing…</p>;
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><h1 className="text-3xl font-bold text-text-primary">Billing</h1><p className="mt-1 text-text-secondary">Only firm Administrators can view or change the subscription.</p></header>
    {notice && <p role="status" className="rounded bg-forge-teal-700/10 p-3">{notice}</p>}
    {error && <div role="alert" className="rounded bg-risk-high/10 p-3 text-risk-high">{error} <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div>}
    <Card title="Current subscription" className="border-none bg-forge-navy-950 text-white"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-forge-subtext-onDark">Plan</p><p className="flex items-center gap-2 text-2xl font-black capitalize">{summary?.subscription?.tier ?? 'free'} <ShieldCheck aria-hidden="true" /></p></div><div><p className="text-sm text-forge-subtext-onDark">Status</p><p className="font-bold capitalize">{summary?.subscription?.status ?? 'inactive'}</p></div></div></Card>
    <section aria-labelledby="plans-title"><h2 id="plans-title" className="text-xl font-bold">Available plans</h2><div className="mt-3 grid gap-4 md:grid-cols-2">{summary?.plans.map((plan) => <Card key={plan.tier} title={plan.tier[0].toUpperCase() + plan.tier.slice(1)}><p className="text-2xl font-black">{currencyAmount(plan)}</p><p className="mt-2 text-sm text-text-secondary">Checkout is completed on Paystack. The server verifies payment before enabling the plan.</p><Button className="mt-4 w-full" disabled={busyTier !== null} onClick={() => void checkout(plan.tier)}><CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />{busyTier === plan.tier ? 'Opening checkout…' : `Choose ${plan.tier}`}</Button></Card>)}</div></section>
    <section aria-labelledby="history-title"><h2 id="history-title" className="text-xl font-bold">Recent transactions</h2>{summary?.transactions.length ? <ul className="mt-3 space-y-2">{summary.transactions.map((transaction) => <li key={transaction.id} className="flex flex-wrap justify-between gap-2 rounded border border-forge-silver-300 bg-white p-3"><span className="capitalize">{transaction.tier} · {transaction.status}</span><span>{currencyAmount(transaction)}</span><span className="font-mono text-xs">{transaction.reference}</span></li>)}</ul> : <p className="mt-2 text-text-secondary">No transactions yet.</p>}</section>
    <p className="text-xs text-text-secondary">Forge Global never stores card or bank credentials. Paystack processes payment details; this application stores only transaction references and subscription state.</p>
  </div>;
}
