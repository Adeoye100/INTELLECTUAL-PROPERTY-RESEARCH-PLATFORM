import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BriefcaseBusiness, CalendarDays, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Card } from '../../components/Card';
import type { DashboardAnalytics } from '../../types';
import { useAuthStore } from '../auth/authStore';
import { getDashboardAnalytics, type DashboardRange } from './dashboardApi';
import { ChartCard, ChartEmptyState, AccessibleDataTable, RiskBadge } from '../../components/visualization/ChartPrimitives';

export const DashboardScreen: React.FC = () => {
  const [range, setRange] = useState<DashboardRange>('30d');
  const user = useAuthStore((state) => state.user);
  const dashboard = useQuery<DashboardAnalytics>({
    queryKey: ['dashboard', 'analytics', range],
    queryFn: () => getDashboardAnalytics(range),
    enabled: Boolean(user),
    retry: false,
  });

  if (dashboard.isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <header><h1 className="text-2xl font-bold text-text-primary">Console Overview</h1><p className="text-sm text-text-secondary">Loading firm activity…</p></header>
        <div className="h-36 animate-pulse rounded-lg bg-forge-silver-100" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"><div className="h-28 animate-pulse motion-reduce:animate-none rounded-lg bg-forge-silver-100" /><div className="h-28 animate-pulse motion-reduce:animate-none rounded-lg bg-forge-silver-100" /><div className="h-28 animate-pulse motion-reduce:animate-none rounded-lg bg-forge-silver-100" /><div className="h-28 animate-pulse motion-reduce:animate-none rounded-lg bg-forge-silver-100" /></div>
      </div>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <section className="mx-auto max-w-2xl rounded-lg border border-risk-high/30 bg-risk-high/10 p-8 text-center" role="alert">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-risk-high" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-text-primary">Dashboard unavailable</h1>
        <p className="mt-2 text-text-secondary">Firm activity could not be loaded. No cached legal data is being presented as current.</p>
        <button type="button" className="mt-5 inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover" onClick={() => void dashboard.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry dashboard</button>
      </section>
    );
  }

  return (
    <AnalyticsDashboard
      data={dashboard.data}
      range={range}
      onRangeChange={setRange}
      onRetry={() => void dashboard.refetch()}
    />
  );
};

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <Card><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase text-text-secondary">{label}</p><span className="text-forge-teal-700">{icon}</span></div><p className="mt-1 text-3xl font-black text-text-primary">{value}</p><p className="mt-2 text-xs text-text-secondary">{detail}</p></Card>;
}

function AnalyticsDashboard({
  data,
  range,
  onRangeChange,
  onRetry,
}: {
  data: DashboardAnalytics;
  range: DashboardRange;
  onRangeChange: (r: DashboardRange) => void;
  onRetry: () => void;
}) {
  const riskRows = data.portfolio.byRisk.filter((entry) => ['low', 'medium', 'high', 'unknown'].includes(entry.risk));
  const points = data.watchActivity.points;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Console Overview</h1>
          <p className="text-sm text-text-secondary">Portfolio and watch activity for the last {data.range.replace('d', ' days')}.</p>
          <p className="mt-1 text-xs text-text-secondary">Generated {new Date(data.generatedAt).toLocaleString()} · {data.cacheStatus === 'hit' ? 'Cached aggregate' : 'Fresh aggregate'} · Not real-time.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-forge-silver-300 bg-surface-base p-1" role="group" aria-label="Select analytics time range">
          {(['7d', '30d', '90d'] as DashboardRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r)}
              className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
                range === r
                  ? 'bg-forge-teal-700 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Portfolio analytics summary">
        <MetricCard label="Total marks" value={String(data.portfolio.total)} detail="Firm-scoped portfolio" icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />} />
        <MetricCard label="Renewals due soon" value={String(data.portfolio.renewalsDueSoon)} detail="Within 30 days" icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />} />
        <MetricCard label="Enabled watches" value={String(data.watchActivity.enabled)} detail="Polling configured" icon={<Eye className="h-5 w-5" aria-hidden="true" />} />
        <MetricCard label="Paused watches" value={String(data.watchActivity.disabled)} detail="Not polling" icon={<EyeOff className="h-5 w-5" aria-hidden="true" />} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Portfolio risk distribution" description="Risk ratings are research signals, not legal conclusions.">
          {riskRows.length ? (
            <div className="space-y-3">
              {riskRows.map((entry) => (
                <div key={entry.risk} className="flex items-center justify-between gap-3">
                  <RiskBadge rating={entry.risk} />
                  <span className="font-semibold text-text-primary">{entry.count} marks</span>
                </div>
              ))}
              <AccessibleDataTable caption="Portfolio risk distribution" rows={riskRows.map((entry) => ({ label: entry.risk === 'unknown' ? 'Unassessed risk' : `${entry.risk} risk`, value: String(entry.count), detail: 'marks' }))} />
            </div>
          ) : (
            <ChartEmptyState message="No portfolio risk data is available yet." />
          )}
        </ChartCard>
        <ChartCard title="Watch activity" description="Polls and alerts recorded by day; partial and unavailable polls remain visible.">
          {points.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Watch activity by day</caption>
                <thead>
                  <tr className="border-b border-forge-silver-300">
                    <th scope="col" className="py-2">Date</th>
                    <th scope="col" className="py-2">Polls</th>
                    <th scope="col" className="py-2">Alerts</th>
                    <th scope="col" className="py-2">Partial</th>
                    <th scope="col" className="py-2">Unavailable</th>
                  </tr>
                </thead>
                <tbody>
                  {points.slice(-14).map((point) => (
                    <tr key={point.date} className="border-b border-forge-silver-100">
                      <th scope="row" className="py-2 font-normal">{point.date}</th>
                      <td className="py-2">{point.polls}</td>
                      <td className="py-2">{point.alerts}</td>
                      <td className="py-2">{point.partial}</td>
                      <td className="py-2">{point.unavailable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ChartEmptyState message="No watch activity in this range." />
          )}
        </ChartCard>
      </section>

      {points.some((point) => point.partial || point.unavailable) && (
        <div className="rounded border border-forge-silver-300 bg-surface-base p-3 text-sm" role="status">
          Some watch polls were partial or unavailable. Valid activity remains shown; retry after checking source configuration.
        </div>
      )}

      <button type="button" className="text-sm font-semibold text-forge-teal-700 underline" onClick={onRetry}>
        Refresh aggregate
      </button>
    </div>
  );
}
