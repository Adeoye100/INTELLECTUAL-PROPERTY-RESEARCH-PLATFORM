import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Eye, RefreshCw, Shield } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { listAlerts, listWatches } from './watchesApi';
import { defaultAlertFilters, sortAlertsNewestFirst } from './watchAlertDomain';

export function ReadOnlyWatchesScreen() {
  const watches = useQuery({ queryKey: ['watches'], queryFn: listWatches, retry: false });
  const alerts = useQuery({
    queryKey: ['alerts', 'read-only'],
    queryFn: () => listAlerts(defaultAlertFilters),
    retry: false,
  });
  const recentAlerts = sortAlertsNewestFirst(alerts.data ?? []).slice(0, 20);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Watches & Alerts</h1>
        <p className="text-sm text-text-secondary">Review saved watch configuration and existing alerts.</p>
      </header>

      <section aria-labelledby="read-only-watch-list-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="read-only-watch-list-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary">
            <Eye className="h-4 w-4" aria-hidden="true" />Configured watches
          </h2>
          {watches.isError && (
            <Button size="sm" variant="outline" onClick={() => void watches.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry watches
            </Button>
          )}
        </div>

        {watches.isLoading ? (
          <p role="status">Loading watches…</p>
        ) : watches.isError ? (
          <div role="alert" className="flex items-start gap-2 rounded border border-risk-high/30 bg-risk-high/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-risk-high" aria-hidden="true" />
            <p>Watch records could not be loaded. Search and Risk Analysis are unaffected.</p>
          </div>
        ) : watches.data?.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {watches.data.map((watch) => {
              const enabled = watch.state === 'enabled' || watch.active !== false;
              return (
                <Card key={watch.id} className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 font-mono font-bold uppercase text-foreground">
                      <Shield className="h-4 w-4 shrink-0 text-forge-teal-700" aria-hidden="true" />
                      <span className="truncate">{watch.markText || 'Portfolio mark'}</span>
                    </span>
                    <Badge risk={enabled ? 'low' : undefined}>{enabled ? 'Active' : 'Paused'}</Badge>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt>Registry</dt><dd>{watch.jurisdiction || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Channel</dt><dd className="font-semibold">{watch.alertChannel}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Mode</dt><dd className="font-semibold">{watch.alertMode}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Last check</dt><dd>{watch.lastPolledAt ? new Date(watch.lastPolledAt).toLocaleString() : 'Not yet checked'}</dd></div>
                  </dl>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="rounded border border-dashed border-border p-8 text-center text-muted-foreground">No watches are configured for this firm.</p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="read-only-alerts-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="read-only-alerts-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary">
            <Bell className="h-4 w-4" aria-hidden="true" />Recent alerts
          </h2>
          {alerts.isError && (
            <Button size="sm" variant="outline" onClick={() => void alerts.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry alerts
            </Button>
          )}
        </div>

        {alerts.isLoading ? (
          <p role="status">Loading alerts…</p>
        ) : alerts.isError ? (
          <div role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-4">Alerts could not be loaded.</div>
        ) : recentAlerts.length === 0 ? (
          <div className="rounded border border-dashed border-border p-10 text-center">
            <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">No existing alerts.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentAlerts.map((alert) => {
              const candidateMark = alert.riskScore?.candidateMarkText ?? alert.matchedMarkText ?? 'Candidate mark';
              const candidateRef = alert.riskScore?.candidateRegistryReference ?? alert.matchedFilingRef ?? '—';
              const source = alert.riskScore?.candidateSource ?? alert.source ?? 'USPTO';
              return (
                <article key={alert.id} className="rounded border border-border bg-card p-4 text-card-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge risk={alert.severity}>{alert.severity} risk</Badge>
                    <Badge>{alert.status}</Badge>
                    <span className="text-xs font-semibold text-muted-foreground">{source}</span>
                    <time dateTime={alert.createdAt} className="ml-auto text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-2 font-semibold">Potential conflict: <span className="font-mono uppercase">{candidateMark}</span></p>
                  <p className="mt-1 text-sm text-muted-foreground">Registry reference: {candidateRef}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
