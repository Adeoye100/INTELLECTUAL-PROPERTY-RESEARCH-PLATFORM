import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, BriefcaseBusiness, Eye, RefreshCw, Search } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { DashboardSummary } from '../../types';
import { useAuthStore } from '../auth/authStore';
import { OnboardingChecklist } from '../onboarding/OnboardingChecklist';
import { useOnboardingStore } from '../onboarding/onboardingStore';

const fetchDashboard = async (): Promise<DashboardSummary> => {
  const response = await fetch('/api/dashboard/summary');
  if (!response.ok) throw new Error('Dashboard request failed');
  return response.json() as Promise<DashboardSummary>;
};

export const DashboardScreen: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const clientProgress = useOnboardingStore((state) => user ? state.progressByUser[user.id] : undefined);
  const showOnboarding = user?.onboardingRequired === true && !clientProgress?.completedPath;
  const dashboard = useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchDashboard,
    enabled: !showOnboarding,
    retry: false,
  });

  if (showOnboarding) return <OnboardingChecklist />;

  if (dashboard.isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <header><h1 className="text-2xl font-bold text-text-primary">Console Overview</h1><p className="text-sm text-text-secondary">Loading firm activity…</p></header>
        <div className="h-36 animate-pulse rounded-lg bg-forge-silver-100" />
        <div className="grid grid-cols-4 gap-6"><div className="h-28 animate-pulse rounded-lg bg-forge-silver-100" /><div className="h-28 animate-pulse rounded-lg bg-forge-silver-100" /><div className="h-28 animate-pulse rounded-lg bg-forge-silver-100" /><div className="h-28 animate-pulse rounded-lg bg-forge-silver-100" /></div>
      </div>
    );
  }

  if (dashboard.isError) {
    return (
      <section className="mx-auto max-w-2xl rounded-lg border border-risk-high/30 bg-risk-high/10 p-8 text-center" role="alert">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-risk-high" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-text-primary">Dashboard unavailable</h1>
        <p className="mt-2 text-text-secondary">Firm activity could not be loaded. No cached legal data is being presented as current.</p>
        <Button className="mt-5" onClick={() => void dashboard.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry dashboard</Button>
      </section>
    );
  }

  const summary = dashboard.data!;
  const urgentAlerts = summary.recentAlerts
    .filter((alert) => !alert.resolved && alert.riskLevel === 'high')
    .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
  const isEmpty = summary.activeWatches === 0
    && summary.portfolioMarkCount === 0
    && summary.recentAlerts.length === 0
    && summary.recentSearches.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <header><h1 className="text-2xl font-bold text-text-primary">Console Overview</h1><p className="text-sm text-text-secondary">Welcome, {user?.fullName ?? 'researcher'}.</p></header>
        {summary.partial && <PartialDataNotice unavailableSections={summary.unavailableSections} onRetry={() => void dashboard.refetch()} />}
        <section className="rounded-lg border-2 border-dashed border-forge-silver-300 bg-surface-card p-12 text-center"><BriefcaseBusiness className="mx-auto mb-3 h-10 w-10 text-forge-silver-500" aria-hidden="true" /><h2 className="text-xl font-bold text-text-primary">No firm activity yet</h2><p className="mx-auto mt-2 max-w-lg text-text-secondary">Run a trademark search, add a portfolio mark, or configure a watch to populate this dashboard with authoritative activity.</p><div className="mt-5 flex justify-center gap-3"><Link to="/search" className="rounded bg-accent px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Start a search</Link><Link to="/portfolio" className="rounded border border-forge-silver-500 px-4 py-2 font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Open portfolio</Link></div></section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-bold text-text-primary">Console Overview</h1><p className="text-sm text-text-secondary">Welcome back, {user?.fullName ?? 'researcher'}. Current firm activity and risk follow.</p></header>

      {summary.partial && <PartialDataNotice unavailableSections={summary.unavailableSections} onRetry={() => void dashboard.refetch()} />}

      {urgentAlerts.length > 0 && (
        <section className="rounded-lg border-2 border-risk-high bg-white p-5" aria-labelledby="urgent-alerts-heading">
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-risk-high">Requires attention</p><h2 id="urgent-alerts-heading" className="text-xl font-bold text-text-primary">Unresolved High-risk alerts</h2></div><Badge risk="high">{urgentAlerts.length} unresolved</Badge></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[46rem] text-left"><caption className="sr-only">Unresolved High-risk trademark alerts</caption><thead><tr className="border-b border-forge-silver-300 bg-surface-base">{['Matched mark', 'Protected mark', 'Jurisdiction', 'Detected', 'Reference', 'Action'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">{heading}</th>)}</tr></thead><tbody>{urgentAlerts.map((alert) => <tr key={alert.id} className="border-b border-forge-silver-100 last:border-0"><th scope="row" className="px-3 py-3 font-mono text-sm font-bold uppercase text-text-primary">{alert.matchedMarkText}</th><td className="px-3 py-3 text-sm text-text-primary">{alert.protectedMarkText}</td><td className="px-3 py-3 text-sm text-text-primary">{alert.jurisdiction}</td><td className="px-3 py-3 text-sm text-text-primary">{alert.detectedAt}</td><td className="px-3 py-3 font-mono text-xs text-text-secondary">{alert.candidateRef}</td><td className="px-3 py-3"><Link to={`/search/risk/${alert.id}`} className="font-bold text-risk-high underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Review now</Link></td></tr>)}</tbody></table></div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Firm summary metrics">
        <MetricCard label="Active watches" value={String(summary.activeWatches)} icon={<Eye className="h-5 w-5" aria-hidden="true" />} detail="Currently monitoring new filings" />
        <MetricCard label="Portfolio health" value={`${summary.portfolioHealthPercent}%`} icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />} detail={`${summary.portfolioMarkCount} portfolio marks assessed`} />
        <MetricCard label="Recent alerts" value={String(summary.recentAlerts.length)} icon={<AlertCircle className="h-5 w-5" aria-hidden="true" />} detail={`${urgentAlerts.length} unresolved High risk`} />
        <MetricCard label="Recent searches" value={String(summary.recentSearches.length)} icon={<Search className="h-5 w-5" aria-hidden="true" />} detail="Most recent completed searches" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Search activity" className="xl:col-span-2">
          <p className="text-sm text-text-secondary">Completed searches per day; exact searches remain in the table below.</p>
          <div className="mt-3 h-64" role="img" aria-label={`Search activity: ${summary.searchActivity.map((point) => `${point.label} ${point.count}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.searchActivity}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7EAEE" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="count" stroke="#146575" fill="#146575" fillOpacity={0.12} strokeWidth={3} /></AreaChart></ResponsiveContainer>
          </div>
        </Card>
        <Card title="Risk distribution">
          <p className="mb-4 text-sm text-text-secondary">Aggregate portfolio ratings.</p>
          <ul className="space-y-4">{summary.riskDistribution.map((item) => <li key={item.risk} className="flex items-center justify-between"><Badge risk={item.risk}>{item.risk} risk</Badge><span className="font-bold text-text-primary">{item.count} marks</span></li>)}</ul>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Recent alerts" footer={<Link to="/watches" className="flex items-center gap-1 text-sm font-bold text-forge-teal-700 hover:underline">View all alerts <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}>
          {summary.recentAlerts.length === 0 ? <p className="py-8 text-center text-sm text-text-secondary">No recent alerts.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left"><caption className="sr-only">Recent trademark alerts</caption><thead><tr className="border-b border-forge-silver-300"><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Risk</th><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Matched mark</th><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Protected mark</th><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Detected</th></tr></thead><tbody>{summary.recentAlerts.slice(0, 5).map((alert) => <tr key={alert.id} className="border-b border-forge-silver-100 last:border-0"><td className="px-3 py-3"><Badge risk={alert.riskLevel}>{alert.riskLevel}</Badge></td><th scope="row" className="px-3 py-3 font-mono text-sm font-bold uppercase text-text-primary">{alert.matchedMarkText}</th><td className="px-3 py-3 text-sm text-text-primary">{alert.protectedMarkText}</td><td className="px-3 py-3 text-sm text-text-primary">{alert.detectedAt}</td></tr>)}</tbody></table></div>}
        </Card>

        <Card title="Recent searches" footer={<Link to="/search" className="flex items-center gap-1 text-sm font-bold text-forge-teal-700 hover:underline">New search <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}>
          {summary.recentSearches.length === 0 ? <p className="py-8 text-center text-sm text-text-secondary">No recent searches.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left"><caption className="sr-only">Recent trademark searches</caption><thead><tr className="border-b border-forge-silver-300"><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Mark</th><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Jurisdiction</th><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Results</th><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">High risk</th><th scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">Searched</th></tr></thead><tbody>{summary.recentSearches.slice(0, 5).map((search) => <tr key={search.id} className="border-b border-forge-silver-100 last:border-0"><th scope="row" className="px-3 py-3 font-mono text-sm font-bold uppercase text-text-primary">{search.mark}</th><td className="px-3 py-3 text-sm text-text-primary">{search.jurisdictions.join(', ')}</td><td className="px-3 py-3 text-sm text-text-primary">{search.resultCount}</td><td className="px-3 py-3 text-sm text-text-primary">{search.highRiskCount}</td><td className="px-3 py-3 text-sm text-text-primary">{search.searchedAt}</td></tr>)}</tbody></table></div>}
        </Card>
      </section>
    </div>
  );
};

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <Card><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase text-text-secondary">{label}</p><span className="text-forge-teal-700">{icon}</span></div><p className="mt-1 text-3xl font-black text-text-primary">{value}</p><p className="mt-2 text-xs text-text-secondary">{detail}</p></Card>;
}

function PartialDataNotice({ unavailableSections, onRetry }: { unavailableSections: string[]; onRetry: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-risk-medium bg-risk-medium/10 p-4" role="status"><div><p className="font-bold text-text-primary">Dashboard data is partial</p><p className="text-sm text-text-secondary">Unavailable: {unavailableSections.length ? unavailableSections.join(', ') : 'one or more aggregates'}.</p></div><Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry missing data</Button></div>;
}
