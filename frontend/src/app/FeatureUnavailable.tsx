import { Link } from 'react-router-dom';

interface FeatureUnavailableProps {
  title: string;
  detail: string;
}

/** A deliberate initial-deployment state, not a transient API failure. */
export function FeatureUnavailable({ title, detail }: FeatureUnavailableProps) {
  return (
    <section className="mx-auto max-w-2xl rounded-lg border border-forge-silver-300 bg-surface-card p-8 text-center" aria-labelledby="feature-unavailable-heading">
      <p className="text-xs font-bold uppercase tracking-wider text-forge-teal-700">Unavailable in initial deployment</p>
      <h1 id="feature-unavailable-heading" className="mt-2 text-2xl font-bold text-text-primary">{title}</h1>
      <p className="mt-3 text-text-secondary">{detail}</p>
      <Link to="/dashboard" className="mt-6 inline-flex rounded bg-accent px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
        Return to dashboard
      </Link>
    </section>
  );
}
