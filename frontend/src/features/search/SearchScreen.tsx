import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertTriangle, FilterX, MoveHorizontal, Search as SearchIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PdfExport } from '../../components/PdfExport';
import { SourceStatusIndicator } from '../../components/SourceStatusIndicator';
import type { PortfolioMark, SearchResponse, RiskDetailRouteState, SearchResult } from '../../types';
import { useAuthStore } from '../auth/authStore';
import { useOnboardingStore } from '../onboarding/onboardingStore';
import {
  defaultSearchFilters,
  hasSearchFilterParams,
  normalizeSearchFilters,
  rankSearchResults,
  searchFilterStorageKey,
  searchFiltersFromParams,
  searchFiltersSchema,
  searchFiltersToParams,
  type SearchFilters,
} from './searchFilters';
import { importSearchResultToPortfolio, searchTrademarks } from './searchApi';

const jurisdictions = [
  ['US', 'United States (USPTO)'],
  ['EU', 'European Union (EUIPO)'],
  ['GB', 'United Kingdom (UKIPO)'],
  ['CA', 'Canada (CIPO)'],
  ['AU', 'Australia (IP Australia)'],
] as const;

const loadInitialFilters = (params: URLSearchParams, userId: string | undefined) => {
  if (hasSearchFilterParams(params)) {
    const filters = searchFiltersFromParams(params);
    return { filters, submitted: searchFiltersSchema.safeParse(filters).success };
  }

  if (userId) {
    try {
      const stored = localStorage.getItem(searchFilterStorageKey(userId));
      if (stored) {
        const parsed = searchFiltersSchema.safeParse(JSON.parse(stored));
        if (parsed.success) return { filters: parsed.data, submitted: true };
      }
    } catch {
      // Invalid client storage falls back to visible defaults.
    }
  }
  return { filters: defaultSearchFilters, submitted: false };
};

export const SearchScreen: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const completePath = useOnboardingStore((state) => state.completePath);
  const queryClient = useQueryClient();
  const [initialState] = useState(() => loadInitialFilters(searchParams, user?.id));
  const [submittedFilters, setSubmittedFilters] = useState<SearchFilters | null>(
    initialState.submitted ? normalizeSearchFilters(initialState.filters) : null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [portfolioMessage, setPortfolioMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SearchFilters>({
    resolver: zodResolver(searchFiltersSchema),
    defaultValues: initialState.filters,
  });

  const searchQuery = useQuery<SearchResponse>({
    queryKey: ['search', submittedFilters],
    queryFn: () => searchTrademarks(submittedFilters!),
    enabled: submittedFilters !== null,
    retry: false,
    placeholderData: (previousData) => previousData,
  });

  const rankedResults = useMemo(
    () => rankSearchResults(searchQuery.data?.results ?? []),
    [searchQuery.data?.results],
  );
  const sourceStatuses = searchQuery.data?.sourceStatuses ?? [];
  const hasIncompleteSources = sourceStatuses.some(({ status }) => status !== 'complete');
  const allSourcesUnavailable = sourceStatuses.length > 0 && sourceStatuses.every(({ status }) => status === 'unavailable');
  const importToPortfolio = useMutation({
    mutationFn: (result: SearchResult) => importSearchResultToPortfolio(result.id),
    onSuccess: (created) => {
      queryClient.setQueryData<PortfolioMark[]>(['portfolio'], (current = []) => current.some((mark) => mark.id === created.id) ? current : [...current, created]);
      setPortfolioMessage({ type: 'success', text: `${created.markText} was imported to the portfolio. Mock persistence is active.` });
    },
    onError: (error) => setPortfolioMessage({ type: 'error', text: error instanceof Error ? error.message : 'Portfolio import failed.' }),
  });

  const onSubmit = async (values: SearchFilters) => {
    const normalized = normalizeSearchFilters(values);
    const nextParams = searchFiltersToParams(normalized);
    const onboarding = searchParams.get('onboarding');
    if (onboarding) nextParams.set('onboarding', onboarding);
    setSearchParams(nextParams, { replace: true });
    if (user) localStorage.setItem(searchFilterStorageKey(user.id), JSON.stringify(normalized));
    setSubmittedFilters(normalized);

    try {
      await queryClient.fetchQuery({
        queryKey: ['search', normalized],
        queryFn: () => searchTrademarks(normalized),
      });
      if (user && onboarding === 'search') {
        completePath(user.id, 'search');
        setOnboardingComplete(true);
      }
    } catch {
      // The query error state renders the retry action.
    }
  };

  const clearFilters = () => {
    reset(defaultSearchFilters);
    setSubmittedFilters(null);
    setSelectedIds(new Set());
    const nextParams = new URLSearchParams();
    const onboarding = searchParams.get('onboarding');
    if (onboarding) nextParams.set('onboarding', onboarding);
    setSearchParams(nextParams, { replace: true });
    if (user) localStorage.removeItem(searchFilterStorageKey(user.id));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Trademark Search</h1>
        <p className="text-sm text-text-secondary">Cross-registry search with explicit filters and ranked confusion risk.</p>
      </header>

      {onboardingComplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-forge-teal-700 bg-forge-teal-700/10 p-4" role="status">
          <p className="font-bold text-text-primary">First search completed on this browser.</p>
          <Link to="/dashboard" className="font-bold text-forge-teal-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Continue to dashboard</Link>
        </div>
      )}
      {portfolioMessage && <div className={`rounded border p-4 ${portfolioMessage.type === 'success' ? 'border-risk-low bg-risk-low/10' : 'border-risk-high bg-risk-high/10'}`} role={portfolioMessage.type === 'error' ? 'alert' : 'status'}>{portfolioMessage.text}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <aside className="space-y-4 lg:col-span-1" aria-label="Trademark search filters">
          <Card title="Search filters" className="lg:sticky lg:top-24">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="search-mark" className="mb-1 block text-xs font-bold uppercase text-text-secondary">Mark</label>
                <div className="relative"><SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-forge-silver-500" aria-hidden="true" /><input {...register('mark')} id="search-mark" aria-invalid={Boolean(errors.mark)} aria-describedby={errors.mark ? 'search-mark-error' : undefined} className="w-full rounded border border-forge-silver-300 py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" /></div>
                {errors.mark && <p id="search-mark-error" className="mt-1 text-xs text-risk-high">{errors.mark.message}</p>}
              </div>

              <fieldset>
                <legend className="mb-1 text-xs font-bold uppercase text-text-secondary">Jurisdiction</legend>
                <div className="space-y-2">
                  {jurisdictions.map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"><input type="checkbox" value={value} {...register('jurisdictions')} className="rounded text-accent focus:ring-accent" />{label}</label>)}
                </div>
                {errors.jurisdictions && <p className="mt-1 text-xs text-risk-high">{errors.jurisdictions.message}</p>}
              </fieldset>

              <div><label htmlFor="search-class" className="mb-1 block text-xs font-bold uppercase text-text-secondary">Nice class</label><input {...register('niceClass')} id="search-class" placeholder="9, 35, 42" aria-invalid={Boolean(errors.niceClass)} aria-describedby={errors.niceClass ? 'search-class-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />{errors.niceClass && <p id="search-class-error" className="mt-1 text-xs text-risk-high">{errors.niceClass.message}</p>}</div>
              <div><label htmlFor="search-status" className="mb-1 block text-xs font-bold uppercase text-text-secondary">Status</label><select {...register('status')} id="search-status" className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"><option value="">Any status</option><option value="pending">Pending</option><option value="registered">Registered</option><option value="abandoned">Abandoned</option></select></div>
              <div><label htmlFor="search-owner" className="mb-1 block text-xs font-bold uppercase text-text-secondary">Owner</label><input {...register('owner')} id="search-owner" className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" /></div>

              <fieldset className="space-y-3">
                <legend className="text-xs font-bold uppercase text-text-secondary">Filing-date range</legend>
                <div><label htmlFor="search-filed-from" className="mb-1 block text-xs font-semibold text-text-secondary">From</label><input {...register('filedFrom')} id="search-filed-from" type="date" className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" /></div>
                <div><label htmlFor="search-filed-to" className="mb-1 block text-xs font-semibold text-text-secondary">To</label><input {...register('filedTo')} id="search-filed-to" type="date" aria-invalid={Boolean(errors.filedTo)} aria-describedby={errors.filedTo ? 'search-date-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />{errors.filedTo && <p id="search-date-error" className="mt-1 text-xs text-risk-high">{errors.filedTo.message}</p>}</div>
              </fieldset>

              <div className="flex flex-col gap-2"><Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Searching…' : 'Search trademarks'}</Button><Button type="button" variant="ghost" className="w-full" onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" aria-hidden="true" />Clear filters</Button></div>
            </form>
          </Card>
        </aside>

        <main className="min-w-0 space-y-4 lg:col-span-3" aria-label="Trademark search results">
          {!submittedFilters ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-forge-silver-300 bg-surface-card py-24 text-center"><SearchIcon className="mb-4 h-12 w-12 text-forge-silver-300" aria-hidden="true" /><h2 className="text-lg font-semibold text-text-primary">Ready to search</h2><p className="max-w-sm text-text-secondary">Set the visible filters and submit to query the connected registries.</p></div>
          ) : searchQuery.isLoading ? (
            <div className="space-y-3" role="status" aria-label="Loading trademark results"><div className="h-12 animate-pulse rounded bg-forge-silver-100" /><div className="h-64 animate-pulse rounded bg-forge-silver-100" /><span className="sr-only">Loading trademark results…</span></div>
          ) : searchQuery.isError ? (
            <div className="rounded-lg border border-risk-high/30 bg-risk-high/10 p-8 text-center" role="alert"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-risk-high" aria-hidden="true" /><h2 className="font-bold text-text-primary">Search could not be completed</h2><p className="mt-1 text-sm text-text-secondary">Your filters are preserved. Retry when the registry connection is available.</p><Button className="mt-4" onClick={() => void searchQuery.refetch()}>Retry search</Button></div>
          ) : (
            <div className="space-y-4">
              <SourceStatusIndicator statuses={sourceStatuses} />
              {allSourcesUnavailable && rankedResults.length === 0 ? (
                <div className="rounded-lg border border-risk-high/30 bg-risk-high/10 p-8 text-center" role="alert"><h2 className="font-bold text-text-primary">All registry sources are unavailable</h2><p className="mt-1 text-sm text-text-secondary">No reliable result set can be shown yet. Your filters remain saved.</p><Button className="mt-4" onClick={() => void searchQuery.refetch()}>Retry sources</Button></div>
              ) : rankedResults.length === 0 ? (
                <div className="rounded-lg border border-forge-silver-300 bg-surface-card p-12 text-center"><h2 className="font-bold text-text-primary">No results found</h2><p className="mt-1 text-sm text-text-secondary">No current matches satisfy every submitted filter.</p>{hasIncompleteSources && <Button className="mt-4" onClick={() => void searchQuery.refetch()}>Check pending sources</Button>}</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 px-1 text-sm text-text-secondary"><div><p>Showing {rankedResults.length} ranked matches.</p>{searchQuery.isFetching && <p role="status">Checking for additional source results without clearing this table…</p>}{selectedIds.size > 0 && <p>{selectedIds.size} result{selectedIds.size === 1 ? '' : 's'} selected.</p>}</div><div className="flex flex-wrap gap-2">{hasIncompleteSources && <Button variant="outline" size="sm" onClick={() => void searchQuery.refetch()} disabled={searchQuery.isFetching}>{searchQuery.isFetching ? 'Refreshing sources…' : 'Refresh sources'}</Button>}<PdfExport request={{ reportType: 'search-results', context: { screen: 'search-results', query: submittedFilters.mark, jurisdictions: submittedFilters.jurisdictions, niceClasses: submittedFilters.niceClass, status: submittedFilters.status, owner: submittedFilters.owner, filedFrom: submittedFilters.filedFrom, filedTo: submittedFilters.filedTo, resultIds: rankedResults.map((result) => result.id) } }} label="Export results PDF" /></div></div>
                  <div className="hidden items-center gap-2 text-xs font-semibold text-text-secondary md:max-xl:flex"><MoveHorizontal className="h-4 w-4" aria-hidden="true" />Scroll horizontally to review every legal-data column.</div>
                  <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-forge-silver-300">
                    <table className="min-w-[72rem] w-full border-collapse text-left">
                      <caption className="sr-only">Trademark results ranked by explicit risk level and similarity score</caption>
                      <thead className="bg-surface-base"><tr className="border-b border-forge-silver-300"><th scope="col" className="px-3 py-3 text-xs font-bold uppercase text-text-secondary">Select</th><th scope="col" className="px-3 py-3 text-xs font-bold uppercase text-text-secondary">Rank</th>{['Mark', 'Owner', 'Class', 'Jurisdiction', 'Filing date', 'Source', 'Risk', 'Action'].map((heading) => <th key={heading} scope="col" className="px-3 py-3 text-xs font-bold uppercase text-text-secondary">{heading}</th>)}</tr></thead>
                      <tbody className="divide-y divide-forge-silver-100">
                        {rankedResults.map((result, index) => {
                          const routeState: RiskDetailRouteState = {
                            result,
                            proposedMark: {
                              markText: submittedFilters.mark,
                              jurisdiction: submittedFilters.jurisdictions[0] ?? 'US',
                              niceClasses: submittedFilters.niceClass
                                ? submittedFilters.niceClass.split(',').map((c) => parseInt(c.trim(), 10)).filter(Boolean)
                                : [],
                            },
                            searchQuery: submittedFilters.mark,
                          };
                          return (
                            <tr key={result.id} className="bg-white hover:bg-surface-base">
                              <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(result.id)} onChange={() => toggleSelection(result.id)} aria-label={`Select ${result.candidateMarkText}`} className="rounded text-accent focus:ring-accent" /></td>
                              <td className="px-3 py-3 font-bold text-text-primary">{index + 1}</td>
                              <th scope="row" className="px-3 py-3 font-mono text-sm font-bold uppercase text-text-primary">{result.candidateMarkText}</th>
                              <td className="px-3 py-3 text-sm text-text-primary">{result.owner ?? '—'}</td>
                              <td className="px-3 py-3 text-sm text-text-primary">{result.niceClasses?.join(', ') ?? '—'}</td>
                              <td className="px-3 py-3 text-sm text-text-primary">{result.jurisdiction ?? '—'}</td>
                              <td className="px-3 py-3 text-sm text-text-primary">{result.filingDate ?? '—'}</td>
                              <td className="px-3 py-3 text-sm text-text-primary"><span className="block">{result.candidateSource}</span><span className="font-mono text-xs text-text-secondary">{result.candidateRef}</span></td>
                              <td className="px-3 py-3"><Badge risk={result.riskScore?.compositeRating}>{result.riskScore ? `${result.riskScore.compositeRating} risk` : 'Not scored'}</Badge></td>
                              <td className="px-3 py-3"><div className="flex flex-col items-start gap-2"><Link to={`/search/risk/${result.id}`} state={routeState} className="inline-flex rounded border border-forge-silver-500 px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-forge-silver-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2" aria-label={`Review risk for ${result.candidateMarkText}`}>Review risk</Link>{user?.role !== 'viewer' && <Button variant="ghost" size="sm" disabled={importToPortfolio.isPending && importToPortfolio.variables?.id === result.id} onClick={() => importToPortfolio.mutate(result)}>{importToPortfolio.isPending && importToPortfolio.variables?.id === result.id ? 'Importing…' : 'Import to portfolio'}</Button>}</div></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
