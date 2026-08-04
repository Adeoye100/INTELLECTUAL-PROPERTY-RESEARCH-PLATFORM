import { CheckCircle, Circle, Search, ShieldPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/authStore';
import { useOnboardingStore, type OnboardingPath } from './onboardingStore';

export function OnboardingChecklist() {
  const user = useAuthStore((state) => state.user);
  const progress = useOnboardingStore((state) => user ? state.progressByUser[user.id] : undefined);
  const selectPath = useOnboardingStore((state) => state.selectPath);

  if (!user) return null;

  const select = (path: OnboardingPath) => selectPath(user.id, path);
  const isComplete = Boolean(progress?.completedPath);

  return (
    <section className="mx-auto max-w-3xl space-y-6" aria-labelledby="onboarding-heading">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-forge-teal-700">First-run setup</p>
        <h1 id="onboarding-heading" className="mt-1 text-3xl font-bold text-text-primary">Complete one useful action</h1>
        <p className="mt-2 max-w-2xl text-text-secondary">
          Start with a trademark search or add the first mark your firm already owns. Completing either path unlocks the regular dashboard on future sessions.
        </p>
      </header>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-bold text-text-primary">
          <span>Onboarding checklist</span><span>{isComplete ? 1 : 0} of 1 complete</span>
        </div>
        <div role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={1} aria-valuenow={isComplete ? 1 : 0} className="h-2 overflow-hidden rounded-full bg-forge-silver-100">
          <div className="h-full bg-forge-teal-700 transition-[width]" style={{ width: isComplete ? '100%' : '0%' }} />
        </div>
      </div>

      <ol className="space-y-4">
        <li className="flex gap-3 rounded-lg border border-forge-silver-300 bg-surface-card p-4">
          <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-forge-teal-700" aria-hidden="true" />
          <div><h2 className="font-bold text-text-primary">Account access confirmed</h2><p className="text-sm text-text-secondary">Signed in as {user.email} with the {user.role} role.</p></div>
        </li>
        <li className="rounded-lg border border-forge-silver-300 bg-surface-card p-5">
          <div className="mb-4 flex gap-3">
            <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-forge-silver-500" aria-hidden="true" />
            <div><h2 className="font-bold text-text-primary">Choose your first action</h2><p className="text-sm text-text-secondary">Your choice is saved on this browser until the backend confirms real account activity.</p></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Link onClick={() => select('search')} to="/search?onboarding=search" className="rounded border border-forge-teal-700 p-4 transition-colors hover:bg-forge-teal-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
              <Search className="mb-2 h-6 w-6 text-forge-teal-700" aria-hidden="true" />
              <span className="block font-bold text-text-primary">Run your first search</span>
              <span className="mt-1 block text-sm text-text-secondary">Search a proposed mark across connected registries.</span>
            </Link>
            {user.role === 'viewer' ? (
              <div className="rounded border border-forge-silver-300 bg-surface-base p-4" aria-disabled="true">
                <ShieldPlus className="mb-2 h-6 w-6 text-forge-silver-500" aria-hidden="true" />
                <span className="block font-bold text-text-primary">Add a portfolio mark</span>
                <span className="mt-1 block text-sm text-text-secondary">Viewer accounts are read-only. Use the search path or ask an Attorney/Admin to add a mark.</span>
              </div>
            ) : (
              <Link onClick={() => select('portfolio')} to="/portfolio?onboarding=add" className="rounded border border-forge-teal-700 p-4 transition-colors hover:bg-forge-teal-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
                <ShieldPlus className="mb-2 h-6 w-6 text-forge-teal-700" aria-hidden="true" />
                <span className="block font-bold text-text-primary">Add your first portfolio mark</span>
                <span className="mt-1 block text-sm text-text-secondary">Create a record for a mark your firm owns.</span>
              </Link>
            )}
          </div>
          {progress?.selectedPath && !progress.completedPath && (
            <p className="mt-4 rounded bg-forge-teal-700/10 p-3 text-sm text-text-primary" role="status">
              Saved on this browser: {progress.selectedPath === 'search' ? 'first trademark search' : 'first portfolio mark'} path selected but not yet completed.
            </p>
          )}
        </li>
      </ol>

      <aside className="rounded border border-risk-medium/40 bg-risk-medium/10 p-4 text-sm text-text-primary">
        <strong>Browser progress only:</strong> this checklist records navigation and successful frontend submissions locally. Search history and portfolio ownership remain unconfirmed until the backend returns authoritative onboarding status.
      </aside>
    </section>
  );
}
