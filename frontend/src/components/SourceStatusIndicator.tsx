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
  responded: { label: 'Responded', risk: 'low' },
  pending: { label: 'Pending', risk: 'medium' },
  unavailable: { label: 'Unavailable', risk: 'high' },
};

export const SourceStatusIndicator: React.FC<SourceStatusIndicatorProps> = ({ statuses }) => {
  const hasUnavailableSource = statuses.some(({ status }) => status === 'unavailable');

  return (
    <Card className="shadow-none" title="Registry source status">
      <div className="space-y-3">
        {hasUnavailableSource && (
          <div
            className="flex items-start gap-2 rounded border border-risk-high/30 bg-risk-high/10 px-3 py-2 text-sm font-semibold text-risk-high"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Results are partial because one or more registry sources are unavailable.</span>
          </div>
        )}

        <ul className="flex flex-wrap gap-2" aria-label="Registry source statuses">
          {statuses.map(({ source, status }) => {
            const presentation = statusPresentation[status];

            return (
              <li key={source}>
                <Badge risk={presentation.risk}>
                  {source}: {presentation.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
};
