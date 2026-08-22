import React from 'react';
import { cn } from '../lib/utils';
import { Info } from 'lucide-react';

type RiskLevel = 'low' | 'medium' | 'high' | 'none';

interface BadgeProps {
  children: React.ReactNode;
  risk?: RiskLevel;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, risk = 'none', tone = 'neutral', className }) => {
  const riskStyles = { low: 'bg-risk-low text-white', medium: 'bg-risk-medium text-white', high: 'bg-risk-high text-white', none: 'bg-forge-silver-100 text-text-primary border-forge-silver-300' };
  const toneStyles = { neutral: riskStyles.none, success: 'bg-status-success/10 text-status-success border-status-success/40', warning: 'bg-status-warning/10 text-status-warning border-status-warning/40', danger: 'bg-status-danger/10 text-status-danger border-status-danger/40' };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider',
        risk === 'none' ? toneStyles[tone] : riskStyles[risk],
        className
      )}
    >
      {risk === 'none' && tone !== 'neutral' && <Info className="w-3 h-3" aria-hidden="true" />}
      {children}
    </span>
  );
};
