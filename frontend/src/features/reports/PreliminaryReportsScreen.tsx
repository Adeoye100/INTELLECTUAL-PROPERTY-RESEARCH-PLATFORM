import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, FileWarning } from 'lucide-react';
import { Card } from '../../components/Card';
import { PdfExport } from '../../components/PdfExport';
import { listPortfolioMarks } from '../portfolio/portfolioApi';

export function PreliminaryReportsScreen() {
  const [selectedId, setSelectedId] = useState('');
  const portfolio = useQuery({
    queryKey: ['portfolio', 'reports'],
    queryFn: () => listPortfolioMarks({ pageSize: 100 }).then((response) => response.items),
    retry: false,
  });
  const selected = portfolio.data?.find((mark) => mark.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-forge-teal-700">Server report service</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Reports</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Generate authenticated PDF reports from saved server-side records. Browser print-to-PDF generation is intentionally disabled.
        </p>
      </header>

      <Card title="Portfolio report">
        {portfolio.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Loading portfolio marks…</p>
        ) : portfolio.isError ? (
          <div className="flex gap-3 rounded border border-risk-high/30 bg-risk-high/10 p-4" role="alert">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-risk-high" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">Portfolio records could not be loaded.</p>
              <p className="mt-1 text-sm text-muted-foreground">Report generation remains server-side and will be available when the portfolio service responds.</p>
            </div>
          </div>
        ) : portfolio.data?.length ? (
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-foreground" htmlFor="report-portfolio-mark">
              Select portfolio mark
              <select
                id="report-portfolio-mark"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Choose a mark</option>
                {portfolio.data.map((mark) => (
                  <option key={mark.id} value={mark.id}>{mark.markText} · {mark.jurisdiction} · {mark.registryReference}</option>
                ))}
              </select>
            </label>

            {selected && (
              <div className="rounded border border-border bg-muted p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{selected.markText}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.sourceRegistry} · {selected.registryReference} · {selected.status}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Nice classes: {selected.niceClasses.length ? selected.niceClasses.join(', ') : 'Not recorded'}
                    </p>
                  </div>
                  <PdfExport
                    request={{ reportType: 'portfolio-summary', context: { portfolioMarkId: selected.id, includeWatches: true, includeAlerts: true } }}
                    label="Generate portfolio PDF"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-3 rounded border border-border bg-muted p-4" role="status">
            <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">No portfolio marks are available yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">Add a portfolio mark before generating a portfolio report.</p>
            </div>
          </div>
        )}
      </Card>

      <Card title="Search and risk reports">
        <p className="text-sm text-muted-foreground">
          Search-result and risk-detail PDFs are generated from their respective Search and Risk Analysis screens so each export remains tied to the exact persisted search snapshot and evidence record.
        </p>
      </Card>
    </div>
  );
}
