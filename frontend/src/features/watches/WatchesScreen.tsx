import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AlertTriangle, ArrowRight, Bell, CheckCircle, Eye, FilterX, RefreshCw, Settings, Shield } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Link, useSearchParams } from 'react-router-dom';
import type { Alert, WatchSummary, WatchUpsertRequest } from '../../types';
import { Modal } from '../../components/Modal';
import { useAuthStore } from '../auth/authStore';
import {
  alertFiltersFromParams,
  alertFiltersToParams,
  filterAlerts,
  type AlertFilters,
} from './watchAlertDomain';
import { ApiError } from '../../lib/api/client';
import { listPortfolioMarks } from '../portfolio/portfolioApi';
import { createWatch, listAlerts, listWatches, updateAlertReadState, updateWatch } from './watchesApi';

const watchSchema = z.object({
  portfolioMarkId: z.string().min(1, 'Choose a portfolio mark.'),
  alertChannel: z.enum(['email', 'in-app'], { message: 'Choose email or in-app.' }),
  alertMode: z.enum(['real-time', 'digest'], { message: 'Choose real-time or digest.' }),
  active: z.boolean(),
});

type WatchFormValues = z.infer<typeof watchSchema>;

export const WatchesScreen: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const filters = alertFiltersFromParams(searchParams);
  const selectedMarkId = searchParams.get('markId') ?? '';
  const [isWatchOpen, setIsWatchOpen] = useState(Boolean(selectedMarkId) && user?.role !== 'viewer');
  const [editingWatch, setEditingWatch] = useState<WatchSummary | null>(null);
  const [requestMessage, setRequestMessage] = useState<{ type: 'success' | 'permission' | 'error'; text: string } | null>(null);
  const watches = useQuery({ queryKey: ['watches'], queryFn: listWatches, retry: false });
  const portfolio = useQuery({ queryKey: ['portfolio'], queryFn: listPortfolioMarks, retry: false });
  const alerts = useQuery({ queryKey: ['alerts', filters], queryFn: () => listAlerts(filters), retry: false, placeholderData: (previous) => previous });
  const visibleAlerts = filterAlerts(alerts.data ?? [], filters);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WatchFormValues>({ resolver: zodResolver(watchSchema), defaultValues: { portfolioMarkId: selectedMarkId, alertChannel: 'email', alertMode: 'real-time', active: true } });

  useEffect(() => {
    if (selectedMarkId) reset({ portfolioMarkId: selectedMarkId, alertChannel: 'email', alertMode: 'real-time', active: true });
  }, [reset, selectedMarkId]);

  const setAlertFilter = <Key extends keyof AlertFilters>(key: Key, value: AlertFilters[Key]) => {
    const next = alertFiltersToParams({ ...filters, [key]: value });
    if (selectedMarkId) next.set('markId', selectedMarkId);
    setSearchParams(next, { replace: true });
  };

  const saveWatch = useMutation({
    mutationFn: (values: WatchUpsertRequest) => editingWatch
      ? updateWatch(editingWatch.id, values)
      : createWatch(values),
    onSuccess: (saved) => {
      queryClient.setQueryData<WatchSummary[]>(['watches'], (current = []) => editingWatch ? current.map((watch) => watch.id === saved.id ? saved : watch) : [...current, saved]);
      setRequestMessage({ type: 'success', text: `${saved.markText} watch ${editingWatch ? 'updated' : 'created'}. Mock persistence is active.` });
      setIsWatchOpen(false);
      setEditingWatch(null);
    },
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : 'HTTP_ERROR';
      setRequestMessage(code === 'FORBIDDEN'
        ? { type: 'permission', text: 'You do not have permission to create or change watches.' }
        : code === 'VALIDATION_ERROR'
          ? { type: 'error', text: 'The server rejected this watch configuration. Review each field.' }
          : { type: 'error', text: 'The watch request failed. Your settings are preserved; retry when the service is available.' });
    },
  });

  const readMutation = useMutation({
    mutationFn: (alert: Alert) => updateAlertReadState(alert.id, !alert.read),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const openCreate = () => {
    setEditingWatch(null);
    reset({ portfolioMarkId: selectedMarkId, alertChannel: 'email', alertMode: 'real-time', active: true });
    setIsWatchOpen(true);
  };

  const openEdit = (watch: WatchSummary) => {
    setEditingWatch(watch);
    reset({ portfolioMarkId: watch.portfolioMarkId, alertChannel: watch.alertChannel, alertMode: watch.alertMode, active: watch.active });
    setIsWatchOpen(true);
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4 md:max-xl:flex-col md:max-xl:items-stretch"><div><h1 className="text-2xl font-bold text-text-primary">Watches & Alerts</h1><p className="text-sm text-text-secondary">Email and in-app monitoring; SMS is not available in this scope.</p></div>{user?.role !== 'viewer' && <Button size="sm" onClick={openCreate}><Eye className="mr-2 h-4 w-4" aria-hidden="true" />Create new watch</Button>}</header>

      {(watches.data?.some((watch) => watch.mocked) || alerts.data?.some((alert) => alert.mocked)) && <p className="rounded border border-risk-medium/40 bg-risk-medium/10 p-3 text-sm" role="status"><strong>Mock monitoring data:</strong> watch scheduling, alert generation, delivery, and authorization remain backend-blocked.</p>}

      {user?.role === 'viewer' && <div className="rounded border border-risk-medium/40 bg-risk-medium/10 p-4" role="note"><strong>View-only access:</strong> an Attorney or Admin must change watch settings.</div>}
      {requestMessage && <div role={requestMessage.type === 'success' ? 'status' : 'alert'} className={`flex items-start gap-2 rounded border p-4 ${requestMessage.type === 'success' ? 'border-risk-low bg-risk-low/10' : 'border-risk-high/40 bg-risk-high/10'}`}>{requestMessage.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 text-risk-low" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-risk-high" aria-hidden="true" />}<span>{requestMessage.text}</span></div>}

      <section aria-labelledby="watch-list-heading"><div className="mb-3 flex items-center justify-between"><h2 id="watch-list-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary"><Eye className="h-4 w-4" aria-hidden="true" />Configured watches</h2>{watches.isError && <Button size="sm" variant="outline" onClick={() => void watches.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry watches</Button>}</div>
        {watches.isLoading ? <p role="status">Loading watches…</p> : watches.isError ? <p role="alert" className="rounded bg-risk-high/10 p-4">Watches could not be loaded.</p> : watches.data?.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{watches.data.map((watch) => <Card key={watch.id} className="p-4"><div className="mb-3 flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-mono font-bold uppercase"><Shield className="h-4 w-4 text-forge-teal-700" aria-hidden="true" />{watch.markText}</span><Badge risk={watch.active ? 'low' : undefined}>{watch.active ? 'Active' : 'Paused'}</Badge></div><dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Channel</dt><dd className="font-bold">{watch.alertChannel}</dd></div><div className="flex justify-between"><dt>Mode</dt><dd className="font-bold">{watch.alertMode}</dd></div><div className="flex justify-between"><dt>Jurisdiction</dt><dd>{watch.jurisdiction}</dd></div></dl>{user?.role !== 'viewer' && <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => openEdit(watch)}><Settings className="mr-2 h-4 w-4" aria-hidden="true" />Manage watch</Button>}</Card>)}</div> : <p className="rounded border border-dashed border-forge-silver-300 p-8 text-center text-text-secondary">No watches configured.</p>}
      </section>

      <Card title="Filter alerts"><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div><label htmlFor="alert-read-filter" className="mb-1 block text-sm font-bold">Read state</label><select id="alert-read-filter" value={filters.readState} onChange={(event) => setAlertFilter('readState', event.target.value as AlertFilters['readState'])} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="">Read and unread</option><option value="unread">Unread</option><option value="read">Read</option></select></div>
        <div><label htmlFor="alert-severity-filter" className="mb-1 block text-sm font-bold">Severity</label><select id="alert-severity-filter" value={filters.severity} onChange={(event) => setAlertFilter('severity', event.target.value as AlertFilters['severity'])} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
        <div><label htmlFor="alert-source-filter" className="mb-1 block text-sm font-bold">Source</label><select id="alert-source-filter" value={filters.source} onChange={(event) => setAlertFilter('source', event.target.value)} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="">All sources</option><option value="USPTO">USPTO</option><option value="EUIPO">EUIPO</option><option value="UKIPO">UKIPO</option></select></div>
        <div><label htmlFor="alert-date-from" className="mb-1 block text-sm font-bold">From date</label><input id="alert-date-from" type="date" value={filters.dateFrom} onChange={(event) => setAlertFilter('dateFrom', event.target.value)} className="w-full rounded border border-forge-silver-300 px-3 py-2" /></div>
        <div><label htmlFor="alert-date-to" className="mb-1 block text-sm font-bold">To date</label><input id="alert-date-to" type="date" value={filters.dateTo} onChange={(event) => setAlertFilter('dateTo', event.target.value)} className="w-full rounded border border-forge-silver-300 px-3 py-2" /></div>
        <Button variant="ghost" className="self-end" onClick={() => setSearchParams(selectedMarkId ? new URLSearchParams({ markId: selectedMarkId }) : new URLSearchParams(), { replace: true })}><FilterX className="mr-2 h-4 w-4" aria-hidden="true" />Clear alert filters</Button>
      </div></Card>

      <section className="space-y-4" aria-labelledby="alerts-heading"><div className="flex items-center justify-between"><h2 id="alerts-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary"><Bell className="h-4 w-4" aria-hidden="true" />Recent alerts</h2>{alerts.isFetching && <span role="status" className="text-sm text-text-secondary">Refreshing alerts…</span>}</div>
        {alerts.isLoading ? <p role="status">Loading alerts…</p> : alerts.isError ? <div role="alert" className="rounded bg-risk-high/10 p-5"><p>Alerts could not be loaded.</p><Button className="mt-3" onClick={() => void alerts.refetch()}>Retry alerts</Button></div> : visibleAlerts.length === 0 ? <div className="rounded border border-dashed border-forge-silver-300 p-10 text-center"><Bell className="mx-auto mb-3 h-10 w-10 text-forge-silver-300" aria-hidden="true" /><p className="text-text-secondary">No alerts match these filters.</p></div> : visibleAlerts.map((alert) => <article key={alert.id} data-testid={`alert-${alert.id}`} className={`rounded-lg border-l-4 p-5 shadow-sm ${alert.read ? 'border border-forge-silver-300 border-l-forge-silver-500 bg-white' : 'border border-forge-teal-700/40 border-l-forge-teal-700 bg-forge-teal-700/10 ring-1 ring-forge-teal-700/20'}`} aria-label={`${alert.read ? 'Read' : 'Unread'} ${alert.severity} alert for ${alert.matchedMarkText}`}><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge risk={alert.severity}>{alert.severity} risk</Badge><Badge>{alert.read ? 'Read' : 'Unread'}</Badge><span className="text-xs font-bold text-text-secondary">{alert.source}</span><time dateTime={alert.createdAt} className="text-xs text-text-secondary">{new Date(alert.createdAt).toLocaleString()}</time></div><h3 className="text-lg font-bold">Potential conflict: <span className="font-mono uppercase">{alert.matchedMarkText}</span></h3><p className="mt-1 text-sm text-text-secondary">Matched against {alert.protectedMarkText} · {alert.matchedFilingRef}</p><div className="mt-3"><p className="text-xs font-bold uppercase text-text-secondary">Supporting evidence</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text-primary">{alert.supportingEvidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></div></div><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={readMutation.isPending} onClick={() => readMutation.mutate(alert)}>Mark {alert.read ? 'unread' : 'read'}</Button><Link to={`/search/risk/${alert.riskResultId}?fromAlert=${alert.id}`} className="inline-flex items-center rounded border border-forge-silver-500 px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent">Analyze risk <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></div></div></article>)}
      </section>

      <Modal isOpen={isWatchOpen} onClose={() => { setIsWatchOpen(false); setEditingWatch(null); }} title={editingWatch ? `Manage ${editingWatch.markText}` : 'Create a watch'} footer={<><Button variant="ghost" onClick={() => setIsWatchOpen(false)}>Cancel</Button><Button type="submit" form="watch-form" disabled={saveWatch.isPending}>{saveWatch.isPending ? 'Saving…' : editingWatch ? 'Save watch' : 'Create watch'}</Button></>}>
        <form id="watch-form" onSubmit={handleSubmit((values) => saveWatch.mutate(values))} className="space-y-4" noValidate>
          <div><label htmlFor="watch-mark" className="mb-1 block text-sm font-bold">Portfolio mark</label><select {...register('portfolioMarkId')} id="watch-mark" disabled={Boolean(editingWatch)} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="">Choose a mark</option>{portfolio.data?.map((mark) => <option key={mark.id} value={mark.id}>{mark.markText} ({mark.jurisdiction})</option>)}</select>{errors.portfolioMarkId && <p className="mt-1 text-xs text-risk-high" role="alert">{errors.portfolioMarkId.message}</p>}</div>
          <div><label htmlFor="watch-channel" className="mb-1 block text-sm font-bold">Alert channel</label><select {...register('alertChannel')} id="watch-channel" className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="email">Email</option><option value="in-app">In-app</option></select><p className="mt-1 text-xs text-text-secondary">SMS is outside the implemented scope.</p>{errors.alertChannel && <p className="text-xs text-risk-high" role="alert">{errors.alertChannel.message}</p>}</div>
          <div><label htmlFor="watch-mode" className="mb-1 block text-sm font-bold">Alert mode</label><select {...register('alertMode')} id="watch-mode" className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="real-time">Real-time</option><option value="digest">Digest</option></select>{errors.alertMode && <p className="text-xs text-risk-high" role="alert">{errors.alertMode.message}</p>}</div>
          <Controller name="active" control={control} render={({ field }) => <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={field.value} onChange={field.onChange} />Watch active</label>} />
          {requestMessage && requestMessage.type !== 'success' && <p className="rounded bg-risk-high/10 p-3 text-sm text-risk-high" role="alert">{requestMessage.text}</p>}
        </form>
      </Modal>
    </div>
  );
};
