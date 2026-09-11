import { BarChart3, FileSearch, FolderKanban, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { features } from '../../config/features';

const reportSources = [
  {
    title: 'Search Results Report',
    detail: 'Export the persisted evidence from a completed trademark search.',
    to: '/search',
    icon: FileSearch,
    dependsOn: 'Search',
  },
  {
    title: 'Risk Report',
    detail: 'Export the persisted confusion-risk evidence for a selected search candidate.',
    to: '/risk-analysis',
    icon: ShieldCheck,
    dependsOn: 'Search + Risk Analysis',
  },
  {
    title: 'Portfolio Summary',
    detail: 'Export an eligible portfolio mark summary from the portfolio workspace.',
    to: '/portfolio',
    icon: FolderKanban,
    dependsOn: 'Portfolio',
  },
] as const;

export function ReportsScreen() {
  const exportsEnabled = features.pdfExportEnabled;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-forge-teal-700">Evidence & reporting</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Reports</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Generate PDF reports from persisted research and portfolio evidence. Reports never create new registry evidence during export.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-card-foreground">
          <BarChart3 className="h-4 w-4 text-forge-teal-700" aria-hidden="true" />
          {exportsEnabled ? 'PDF service available' : 'PDF activation pending'}
        </div>
      </header>

      {!exportsEnabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4" role="status">
          <p className="font-semibold text-foreground">Reports are visible, but PDF generation is not activated yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can continue to the source workspaces below. Export controls appear there once the production PDF worker and storage gate are enabled.
          </p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Available report types">
        {reportSources.map(({ title, detail, to, icon: Icon, dependsOn }) => (
          <Card key={title} title={title}>
            <div className="flex h-full flex-col">
              <Icon className="mb-3 h-6 w-6 text-forge-teal-700" aria-hidden="true" />
              <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source: {dependsOn}
              </p>
              <Link
                to={to}
                className="mt-5 inline-flex min-h-10 items-center justify-center rounded border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open source workspace
              </Link>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
