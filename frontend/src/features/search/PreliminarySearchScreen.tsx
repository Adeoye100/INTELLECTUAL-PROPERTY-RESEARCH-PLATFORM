import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search as SearchIcon, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { PortfolioMarkStatus } from '../../types';
import { listPortfolioMarks, type PortfolioMarkListQuery } from '../portfolio/portfolioApi';

type FormState = {
  query: string;
  jurisdiction: string;
  status: '' | PortfolioMarkStatus;
  niceClass: string;
};

const initialForm: FormState = { query: '', jurisdiction: '', status: '', niceClass: '' };

export function PreliminarySearchScreen() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [filters, setFilters] = useState<PortfolioMarkListQuery | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ['preliminary-workspace-search', filters],
    queryFn: () => listPortfolioMarks(filters ?? { pageSize: 50 }),
    enabled: filters !== null,
    retry: false,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setValidationMessage(null);
    let niceClass: number | undefined;
    if (form.niceClass.trim()) {
      niceClass = Number(form.niceClass);
      if (!Number.isInteger(niceClass) || niceClass < 1 || niceClass > 45) {
        setValidationMessage('Nice class must be a whole number from 1 to 45.');
        return;
      }
    }
    setFilters({
      page: 1,
      pageSize: 50,
      query: form.query.trim() || undefined,
      jurisdiction: form.jurisdiction.trim().toUpperCase() || undefined,
      status: form.status || undefined,
      niceClass,
    });
  };

  const clear = () => {
    setForm(initialForm);
    setFilters(null);
    setValidationMessage(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-forge-teal-700">Preliminary research mode</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Trademark Search</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Search the firm&apos;s saved trademark portfolio now while live registry ingestion is being activated.
        </p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4" role="note">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">This is workspace search, not live USPTO registry search.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Results below come only from records already saved in your firm portfolio. No external registry result is invented or presented as current.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card title="Search filters">
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label htmlFor="prelim-search-mark" className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Mark text</label>
              <input id="prelim-search-mark" value={form.query} onChange={(event) => setForm((current) => ({ ...current, query: event.target.value }))} placeholder="e.g. FORGE" className="w-full rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label htmlFor="prelim-search-jurisdiction" className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Jurisdiction</label>
              <input id="prelim-search-jurisdiction" value={form.jurisdiction} onChange={(event) => setForm((current) => ({ ...current, jurisdiction: event.target.value }))} placeholder="US" className="w-full rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label htmlFor="prelim-search-status" className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Status</label>
              <select id="prelim-search-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState['status'] }))} className="w-full rounded border border-input bg-background px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Any status</option>
                <option value="pending">Pending</option>
                <option value="filed">Filed</option>
                <option value="registered">Registered</option>
                <option value="abandoned">Abandoned</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label htmlFor="prelim-search-class" className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Nice class</label>
              <input id="prelim-search-class" inputMode="numeric" value={form.niceClass} onChange={(event) => setForm((current) => ({ ...current, niceClass: event.target.value }))} placeholder="1-45" className="w-full rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            {validationMessage && <p role="alert" className="text-sm text-risk-high">{validationMessage}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1"><SearchIcon className="mr-2 h-4 w-4" aria-hidden="true" />Search</Button>
              <Button type="button" variant="outline" onClick={clear}>Clear</Button>
            </div>
          </form>
        </Card>

        <section aria-label="Workspace search results">
          {filters === null ? (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card p-10 text-center">
              <SearchIcon className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h2 className="font-semibold text-foreground">Ready to search your workspace</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Use any combination of mark, jurisdiction, status, or Nice class.</p>
            </div>
          ) : results.isLoading ? (
            <p role="status" className="rounded border border-border bg-card p-6 text-muted-foreground">Searching saved portfolio records…</p>
          ) : results.isError ? (
            <div role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-6">
              <p className="font-semibold text-foreground">Workspace search could not be completed.</p>
              <Button className="mt-3" size="sm" onClick={() => void results.refetch()}>Retry</Button>
            </div>
          ) : results.data?.items.length ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{results.data.pagination.total} saved mark{results.data.pagination.total === 1 ? '' : 's'} matched.</span>
                <Link to="/portfolio" className="font-semibold text-forge-teal-700 underline">Manage portfolio</Link>
              </div>
              {results.data.items.map((mark) => (
                <article key={mark.id} className="rounded-lg border border-border bg-card p-5 text-card-foreground">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-mono text-lg font-bold uppercase text-foreground">{mark.markText}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{mark.sourceRegistry} · {mark.registryReference} · {mark.jurisdiction}</p>
                      <p className="mt-2 text-sm text-foreground">Nice classes: {mark.niceClasses.length ? mark.niceClasses.join(', ') : 'Not recorded'} · Status: <span className="capitalize">{mark.status}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/portfolio/${encodeURIComponent(mark.id)}`} className="inline-flex min-h-10 items-center rounded border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">Open record</Link>
                      <Link to={`/risk-analysis?candidate=${encodeURIComponent(mark.id)}`} className="inline-flex min-h-10 items-center rounded bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover">Compare risk <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <p className="font-semibold text-foreground">No saved portfolio marks matched.</p>
              <p className="mt-1 text-sm text-muted-foreground">Broaden the filters or add a mark to the portfolio first.</p>
              <Link to="/portfolio" className="mt-4 inline-flex min-h-10 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white">Open portfolio</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
