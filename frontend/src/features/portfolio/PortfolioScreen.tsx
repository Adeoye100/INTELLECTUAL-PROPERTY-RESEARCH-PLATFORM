import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Calendar, Eye, FilterX, MoveHorizontal, Plus, Shield } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import type { PortfolioDetailRouteState, PortfolioMark, WatchSummary } from '../../types';
import { PdfExport } from '../../components/PdfExport';
import { Modal } from '../../components/Modal';
import { useAuthStore } from '../auth/authStore';
import { useOnboardingStore } from '../onboarding/onboardingStore';
import {
  filterPortfolioMarks,
  getRenewalWarning,
  portfolioFiltersFromParams,
  portfolioFiltersToParams,
  type PortfolioFilters,
} from './portfolioDomain';
import { createPortfolioMark, createPortfolioWatch, listPortfolioMarks } from './portfolioApi';
import { listWatches } from '../watches/watchesApi';

const portfolioMarkSchema = z.object({
  markText: z.string().trim().min(2, 'Enter the trademark name.'),
  jurisdiction: z.string().min(2, 'Choose a jurisdiction.'),
  niceClasses: z.string().trim().regex(/^\d+(\s*,\s*\d+)*$/, 'Enter one or more numeric classes separated by commas.'),
  renewalDate: z.string().min(1, 'Choose the next renewal date.'),
});

type PortfolioMarkValues = z.infer<typeof portfolioMarkSchema>;

export const PortfolioScreen: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const completePath = useOnboardingStore((state) => state.completePath);
  const filters = portfolioFiltersFromParams(searchParams);
  const [isAddOpen, setIsAddOpen] = useState(() => searchParams.get('onboarding') === 'add' && user?.role !== 'viewer');
  const [addError, setAddError] = useState<string | null>(null);
  const [watchMessage, setWatchMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const portfolio = useQuery({ queryKey: ['portfolio'], queryFn: listPortfolioMarks, retry: false });
  const watches = useQuery({ queryKey: ['watches'], queryFn: listWatches, retry: false });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PortfolioMarkValues>({ resolver: zodResolver(portfolioMarkSchema) });

  const visibleMarks = filterPortfolioMarks(portfolio.data ?? [], filters);
  const upcomingRenewals = (portfolio.data ?? []).filter((mark) => getRenewalWarning(mark.renewalDate).days <= 90).length;
  const watchedMarkIds = new Set((watches.data ?? []).map((watch) => watch.portfolioMarkId));

  const setFilter = <Key extends keyof PortfolioFilters>(key: Key, value: PortfolioFilters[Key]) => {
    const next = portfolioFiltersToParams({ ...filters, [key]: value });
    const onboarding = searchParams.get('onboarding');
    if (onboarding) next.set('onboarding', onboarding);
    setSearchParams(next, { replace: true });
  };

  const createWatch = useMutation({
    mutationFn: (mark: PortfolioMark) => createPortfolioWatch(mark.id, {
      alertChannel: 'email',
      alertMode: 'real-time',
      active: true,
    }),
    onSuccess: (created) => {
      queryClient.setQueryData<WatchSummary[]>(['watches'], (current = []) => [...current, created]);
      setWatchMessage({ type: 'success', text: `${created.markText} is now watched by email in real time. Mock persistence is active.` });
    },
    onError: (error) => setWatchMessage({ type: 'error', text: error instanceof Error ? error.message : 'Watch creation failed.' }),
  });

  const addMark = async (values: PortfolioMarkValues) => {
    setAddError(null);
    try {
      const created = await createPortfolioMark({
        ...values,
        niceClasses: values.niceClasses.split(',').map((value) => Number(value.trim())),
      });
      queryClient.setQueryData<PortfolioMark[]>(['portfolio'], (current = []) => [...current, created]);
      if (user && searchParams.get('onboarding') === 'add') {
        completePath(user.id, 'portfolio');
        setOnboardingComplete(true);
      }
      reset();
      setIsAddOpen(false);
    } catch {
      setAddError('The mark could not be added. Check your connection and retry.');
    }
  };

  if (portfolio.isLoading) return <div className="p-8 text-center" role="status">Loading portfolio…</div>;
  if (portfolio.isError) return <section role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-8 text-center"><h1 className="text-xl font-bold">Portfolio unavailable</h1><p className="mt-2 text-text-secondary">Portfolio records could not be loaded.</p><Button className="mt-4" onClick={() => void portfolio.refetch()}>Retry portfolio</Button></section>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 md:max-xl:flex-col md:max-xl:items-stretch">
        <div><h1 className="text-2xl font-bold text-text-primary">Protected Portfolio</h1><p className="text-sm text-text-secondary">Managed marks, renewals, status history, and supporting records.</p></div>
        <div className="flex flex-wrap items-start gap-3"><PdfExport request={{ reportType: 'portfolio-summary', context: { screen: 'portfolio', markIds: portfolio.data?.map((mark) => mark.id) ?? [], firmId: portfolio.data?.[0]?.firmId } }} disabled={!portfolio.data?.length} label="Export portfolio PDF" />{user?.role !== 'viewer' && <Button onClick={() => setIsAddOpen(true)}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add mark</Button>}</div>
      </header>

      {portfolio.data?.some((mark) => mark.mocked) && <p className="rounded border border-risk-medium/40 bg-risk-medium/10 p-3 text-sm" role="status"><strong>Mock portfolio data:</strong> persistence, registry synchronization, attachments, and authorization still require backend services.</p>}

      {onboardingComplete && <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-forge-teal-700 bg-forge-teal-700/10 p-4" role="status"><p className="font-bold">First portfolio mark added on this browser.</p><Link to="/dashboard" className="font-bold text-forge-teal-700 underline">Continue to dashboard</Link></div>}
      {watchMessage && <div className={`rounded border p-4 ${watchMessage.type === 'success' ? 'border-risk-low bg-risk-low/10' : 'border-risk-high bg-risk-high/10'}`} role={watchMessage.type === 'error' ? 'alert' : 'status'}>{watchMessage.text}</div>}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Portfolio summary">
        <Card><p className="text-xs font-bold uppercase text-text-secondary">Total assets</p><p className="text-3xl font-black">{portfolio.data?.length ?? 0}</p></Card>
        <Card><p className="text-xs font-bold uppercase text-text-secondary">Renewal warnings</p><p className="text-3xl font-black text-risk-medium">{upcomingRenewals}</p><p className="text-xs text-text-secondary">Due or overdue within 90 days</p></Card>
        <Card><p className="text-xs font-bold uppercase text-text-secondary">Watched marks</p><p className="text-3xl font-black text-forge-teal-700">{watchedMarkIds.size}</p><p className="text-xs text-text-secondary">Mock watch status until backend persistence ships</p></Card>
      </section>

      <Card title="Filter portfolio">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div><label htmlFor="portfolio-filter-mark" className="mb-1 block text-sm font-bold">Mark</label><input id="portfolio-filter-mark" value={filters.mark} onChange={(event) => setFilter('mark', event.target.value)} className="w-full rounded border border-forge-silver-300 px-3 py-2" /></div>
          <div><label htmlFor="portfolio-filter-jurisdiction" className="mb-1 block text-sm font-bold">Jurisdiction</label><select id="portfolio-filter-jurisdiction" value={filters.jurisdiction} onChange={(event) => setFilter('jurisdiction', event.target.value)} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="">All jurisdictions</option><option value="US">United States</option><option value="EU">European Union</option><option value="GB">United Kingdom</option></select></div>
          <div><label htmlFor="portfolio-filter-status" className="mb-1 block text-sm font-bold">Status</label><select id="portfolio-filter-status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="">All statuses</option><option value="Registered">Registered</option><option value="Pending">Pending</option><option value="Draft">Draft</option></select></div>
          <div><label htmlFor="portfolio-filter-renewal" className="mb-1 block text-sm font-bold">Renewal</label><select id="portfolio-filter-renewal" value={filters.renewalWindow} onChange={(event) => setFilter('renewalWindow', event.target.value as PortfolioFilters['renewalWindow'])} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="all">Any date</option><option value="overdue">Overdue</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option><option value="365">Next year</option></select></div>
          <Button variant="ghost" className="self-end" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}><FilterX className="mr-2 h-4 w-4" aria-hidden="true" />Clear filters</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 hidden items-center gap-2 text-xs font-semibold text-text-secondary md:max-xl:flex"><MoveHorizontal className="h-4 w-4" aria-hidden="true" />Scroll horizontally to review all portfolio columns.</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[64rem] border-collapse text-left"><caption className="sr-only">Portfolio marks and renewal deadlines</caption><thead><tr className="border-b border-forge-silver-300 bg-surface-base">{['Mark', 'Jurisdiction', 'Classes', 'Status', 'Renewal date', 'Renewal warning', 'Actions'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 text-xs font-bold uppercase text-text-secondary">{heading}</th>)}</tr></thead><tbody className="divide-y divide-forge-silver-100">
          {visibleMarks.map((mark) => {
            const warning = getRenewalWarning(mark.renewalDate);
            const detailState: PortfolioDetailRouteState = { mark, returnTo: `${location.pathname}${location.search}` };
            return <tr key={mark.id} className="hover:bg-surface-base"><th scope="row" className="px-4 py-3"><span className="flex items-center gap-2 font-mono font-bold uppercase"><Shield className="h-4 w-4 text-forge-silver-500" aria-hidden="true" />{mark.markText}</span></th><td className="px-4 py-3">{mark.jurisdiction}</td><td className="px-4 py-3">{mark.niceClasses.join(', ')}</td><td className="px-4 py-3"><Badge>{mark.status}</Badge></td><td className="px-4 py-3"><span className="flex items-center gap-2"><Calendar className="h-4 w-4" aria-hidden="true" />{mark.renewalDate}</span></td><td className="px-4 py-3"><Badge risk={warning.level}>{warning.label}</Badge></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Link to={`/portfolio/${mark.id}`} state={detailState} className="rounded border border-forge-silver-500 px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent">Details</Link>{user?.role !== 'viewer' && <Button variant="outline" size="sm" disabled={watchedMarkIds.has(mark.id) || (createWatch.isPending && createWatch.variables?.id === mark.id)} onClick={() => createWatch.mutate(mark)}><Eye className="mr-1 h-4 w-4" aria-hidden="true" />{watchedMarkIds.has(mark.id) ? 'Watching' : 'Create watch'}</Button>}</div></td></tr>;
          })}
          {visibleMarks.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-text-secondary">No portfolio marks match these filters.</td></tr>}
        </tbody></table></div>
      </Card>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add a portfolio mark" footer={<><Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button><Button type="submit" form="add-portfolio-mark" disabled={isSubmitting}>{isSubmitting ? 'Adding…' : addError ? 'Retry adding mark' : 'Add mark'}</Button></>}>
        <form id="add-portfolio-mark" onSubmit={handleSubmit(addMark)} className="space-y-4" noValidate>
          <div><label htmlFor="portfolio-mark-text" className="mb-1 block text-sm font-bold">Trademark name</label><input {...register('markText')} id="portfolio-mark-text" autoFocus aria-invalid={Boolean(errors.markText)} aria-describedby={errors.markText ? 'portfolio-mark-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2" />{errors.markText && <p id="portfolio-mark-error" className="mt-1 text-xs text-risk-high">{errors.markText.message}</p>}</div>
          <div><label htmlFor="portfolio-jurisdiction" className="mb-1 block text-sm font-bold">Jurisdiction</label><select {...register('jurisdiction')} id="portfolio-jurisdiction" defaultValue="" className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="" disabled>Choose jurisdiction</option><option value="US">United States</option><option value="EU">European Union</option><option value="GB">United Kingdom</option></select>{errors.jurisdiction && <p className="mt-1 text-xs text-risk-high">{errors.jurisdiction.message}</p>}</div>
          <div><label htmlFor="portfolio-classes" className="mb-1 block text-sm font-bold">Nice classes</label><input {...register('niceClasses')} id="portfolio-classes" placeholder="9, 35, 42" className="w-full rounded border border-forge-silver-300 px-3 py-2" />{errors.niceClasses && <p className="mt-1 text-xs text-risk-high">{errors.niceClasses.message}</p>}</div>
          <div><label htmlFor="portfolio-renewal" className="mb-1 block text-sm font-bold">Next renewal date</label><input {...register('renewalDate')} id="portfolio-renewal" type="date" className="w-full rounded border border-forge-silver-300 px-3 py-2" />{errors.renewalDate && <p className="mt-1 text-xs text-risk-high">{errors.renewalDate.message}</p>}</div>
          {addError && <p className="rounded bg-risk-high/10 p-3 text-sm text-risk-high" role="alert">{addError}</p>}
        </form>
      </Modal>
    </div>
  );
};
