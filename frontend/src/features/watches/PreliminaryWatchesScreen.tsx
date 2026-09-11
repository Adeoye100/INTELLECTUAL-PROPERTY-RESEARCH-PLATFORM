import { ShieldAlert } from 'lucide-react';
import { WatchesScreen } from './WatchesScreen';

export function PreliminaryWatchesScreen() {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4" role="note">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">Preliminary watch configuration is available.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You can create, edit and pause watch rules now. Automated registry polling and email alert delivery remain inactive until live Search freshness and the production watch worker are enabled.
            </p>
          </div>
        </div>
      </div>
      <WatchesScreen />
    </div>
  );
}
