import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { SourceStatusEntry } from '../types';
import { Card } from './Card';
import { SourceStatusIndicator as SourceStatusPill } from './visualization/ChartPrimitives';

export const SourceStatusIndicator: React.FC<{ statuses: SourceStatusEntry[] }> = ({ statuses }) => {
  const hasUnavailable = statuses.some((entry) => entry.status === 'unavailable');
  const hasPending = statuses.some((entry) => entry.status === 'pending' || entry.status === 'delayed');
  return <Card className="shadow-none" title="Registry source status">
    <div className="space-y-3">
      {(hasUnavailable || hasPending) && <div className="flex items-start gap-2 rounded border border-forge-silver-300 bg-surface-base px-3 py-2 text-sm" role={hasUnavailable ? 'status' : 'status'}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
        <span>{hasUnavailable ? 'Results are partial because one or more registry sources are unavailable.' : 'Results are still arriving from configured registry sources.'}</span>
      </div>}
      <ul className="flex flex-wrap gap-2" aria-label="Registry source statuses">{statuses.map((entry) => <li key={entry.source}><SourceStatusPill source={entry.source} status={entry.status} resultCount={entry.resultCount} /></li>)}</ul>
    </div>
  </Card>;
};
