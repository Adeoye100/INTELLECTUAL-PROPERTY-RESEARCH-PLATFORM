import { ShieldAlert } from 'lucide-react';
import { useRuntimeCapabilities } from '../system/runtimeCapabilities';
import { WatchesScreen } from './WatchesScreen';

export function PreliminaryWatchesScreen() {
  const runtime = useRuntimeCapabilities();
  const readOnly = runtime.data?.features.watches.writeStatus === 'blocked';
  const automationEnabled = runtime.data?.features.watches.automationStatus === 'available';

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4" role="note">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">
              {readOnly ? 'Watch data is available in read-only mode.' : 'Watch configuration is available.'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {readOnly
                ? 'Existing watches and alerts can be reviewed, but creating, editing, pausing and dismissing records is paused until the production database is writable.'
                : automationEnabled
                  ? 'Watch configuration and automated registry monitoring are enabled.'
                  : 'You can create, edit and pause watch rules. Automated registry polling and email delivery remain inactive until the production watch worker is enabled.'}
            </p>
          </div>
        </div>
      </div>
      <WatchesScreen />
    </div>
  );
}
