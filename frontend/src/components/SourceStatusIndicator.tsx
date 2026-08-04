import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { SourceStatus, SourceStatusEntry } from '../types';
import { Badge } from './Badge';
import { Card } from './Card';

interface SourceStatusIndicatorProps {
  statuses: SourceStatusEntry[];
}

const statusPresentation: Record<
  SourceStatus,
  { label: string; risk: 'low' | 'medium' | 'high' }
> = {
  complete: { label: 'Complete', risk: 'low' },
  pending: { label: 'Pending', risk: 'medium' },
  delayed: { label: 'Delayed', risk: 'medium' },
  unavailable: { label: 'Unavailable', risk: 'high' },
};

export const SourceStatusIndicator: React.FC<SourceStatusIndicatorProps> = ({ statuses }) => {
  const hasUnavailableSource = statuses.some(({ status }) => status === 'unavailable');
  const hasIncompleteSource = statuses.some(({ status }) => status !== 'complete');

  return (
    <Card className="shadow-none" title="Registry source status">
      <div className="space-y-3">
        {hasIncompleteSource && (
          <div
            className={`flex items-start gap-2 rounded px-3 py-2 text-sm font-semibold ${hasUnavailableSource ? 'border border-risk-high/30 bg-risk-high/10 text-risk-high' : 'border border-risk-medium/30 bg-risk-medium/10 text-text-primary'}`}
            role={hasUnavailableSource ? 'alert' : 'status'}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{hasUnavailableSource ? 'Results are partial because one or more registry sources are unavailable.' : 'Results are still arriving from pending or delayed registry sources.'}</span>
          </div>
        )}

        <ul className="flex flex-wrap gap-2" aria-label="Registry source statuses">
          {statuses.map(({ source, status, resultCount }) => {
            const presentation = statusPresentation[status];

            return (
              <li key={source}>
                <Badge risk={presentation.risk}>
                  {source}: {presentation.label}
                  {typeof resultCount === 'number' && ` (${resultCount})`}
                </Badge>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
};
