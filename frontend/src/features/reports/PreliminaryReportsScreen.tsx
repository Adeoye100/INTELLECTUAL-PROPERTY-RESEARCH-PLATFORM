import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Printer, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { listPortfolioMarks } from '../portfolio/portfolioApi';

export function PreliminaryReportsScreen() {
  const portfolio = useQuery({ queryKey: ['portfolio', 'preliminary-report'], queryFn: () => listPortfolioMarks({ pageSize: 100 }).then((response) => response.items), retry: false });
  const [selectedId, setSelectedId] = useState('');
  const selected = portfolio.data?.find((mark) => mark.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="print:hidden"><p className="text-xs font-bold uppercase tracking-[0.18em] text-forge-teal-700">Preliminary reporting mode</p><h1 className="mt-2 text-3xl font-bold text-foreground">Reports</h1><p className="mt-2 max-w-3xl text-muted-foreground">Generate a printable portfolio summary now while the queued PDF worker remains pending production activation.</p></header>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 print:hidden" role="note"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /><div><p className="font-semibold text-foreground">Browser-generated report.</p><p className="mt-1 text-sm text-muted-foreground">Use Print / Save as PDF for a preliminary portfolio summary. Search and risk evidence exports remain tied to their production data gates.</p></div></div></div>

      <Card title="Portfolio summary" className="print:hidden">
        {portfolio.isLoading ? <p role="status">Loading portfolio marks…</p> : portfolio.isError ? <p role="alert" className="text-risk-high">Portfolio records could not be loaded.</p> : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-semibold text-foreground">Select portfolio mark<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-foreground"><option value="">Choose a mark</option>{portfolio.data?.map((mark) => <option key={mark.id} value={mark.id}>{mark.markText} · {mark.jurisdiction}</option>)}</select></label>
            <Button type="button" disabled={!selected} onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />Print / Save PDF</Button>
          </div>
        )}
      </Card>

      {selected ? (
        <article className="rounded-lg border border-border bg-card p-6 text-card-foreground print:border-0 print:bg-white print:p-0 print:text-black">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4 print:border-black">
            <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground print:text-black">Forge Global · Portfolio Summary</p><h2 className="mt-2 font-mono text-3xl font-black uppercase text-foreground print:text-black">{selected.markText}</h2></div><FileDown className="h-8 w-8 text-forge-teal-700 print:hidden" aria-hidden="true" />
          </div>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Jurisdiction</dt><dd className="mt-1 text-lg font-semibold">{selected.jurisdiction}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Status</dt><dd className="mt-1 text-lg font-semibold capitalize">{selected.status}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Source registry</dt><dd className="mt-1 text-lg font-semibold">{selected.sourceRegistry}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Registry reference</dt><dd className="mt-1 text-lg font-semibold">{selected.registryReference}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Nice classes</dt><dd className="mt-1 text-lg font-semibold">{selected.niceClasses.length ? selected.niceClasses.join(', ') : 'Not recorded'}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Filing date</dt><dd className="mt-1 text-lg font-semibold">{selected.filingDate ?? 'Not recorded'}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Registration date</dt><dd className="mt-1 text-lg font-semibold">{selected.registrationDate ?? 'Not recorded'}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-muted-foreground print:text-black">Renewal date</dt><dd className="mt-1 text-lg font-semibold">{selected.renewalDate ?? 'Not recorded'}</dd></div>
          </dl>
          <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground print:border-black print:text-black">Generated from the firm&apos;s saved portfolio record. This preliminary summary does not perform a fresh registry lookup or provide legal advice.</p>
        </article>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-border bg-card p-12 text-center text-muted-foreground print:hidden">Choose a portfolio mark to preview a report.</div>
      )}
    </div>
  );
}
