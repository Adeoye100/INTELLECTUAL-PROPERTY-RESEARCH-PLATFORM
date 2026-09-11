import { Activity, ArrowRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';

/**
 * Risk Analysis is intentionally entered from an authoritative Search result.
 * This screen gives the capability a first-class product surface without
 * inventing a standalone client-side risk calculation.
 */
export function RiskAnalysisScreen() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-forge-teal-700">Research workflow</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Risk Analysis</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Confusion-risk analysis is generated from a real trademark search candidate so the evidence remains tied to the registry result that produced it.
        </p>
      </header>

      <Card title="Start a risk analysis">
        <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-forge-teal-700/10 text-forge-teal-700">
            <Activity aria-hidden="true" className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Search first, then select a candidate</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              The backend evaluates the selected candidate using the supported visual, phonetic, conceptual and class-overlap evidence. The resulting Low, Medium or High classification is research evidence, not a legal opinion.
            </p>
            <Link
              to="/search"
              className="mt-4 inline-flex min-h-10 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              Open trademark search
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Risk analysis workflow">
        <Card title="1. Search">
          <p className="text-sm text-muted-foreground">Run a registry-backed trademark search and narrow the candidate set.</p>
        </Card>
        <Card title="2. Select evidence">
          <p className="text-sm text-muted-foreground">Open a specific candidate result so the analysis remains reproducible.</p>
        </Card>
        <Card title="3. Review risk">
          <p className="text-sm text-muted-foreground">Inspect the persisted similarity evidence and optionally connect it to a matter.</p>
        </Card>
      </section>
    </div>
  );
}
