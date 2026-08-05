import React from 'react';
import { cn } from '../lib/utils';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

type RiskLevel = 'low' | 'medium' | 'high' | 'none';

interface BadgeProps {
  children: React.ReactNode;
  risk?: RiskLevel;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, risk = 'none', tone = 'neutral', className }) => {
  const riskStyles = {
    low: 'bg-risk-low text-white',
    medium: 'bg-risk-medium text-white',
    high: 'bg-risk-high text-white',
    none: 'bg-forge-silver-300 text-text-primary',
  };

  const icons = {
    low: <CheckCircle className="w-3 h-3 mr-1" aria-hidden="true" />,
    medium: <Info className="w-3 h-3 mr-1" aria-hidden="true" />,
    high: <AlertCircle className="w-3 h-3 mr-1" aria-hidden="true" />,
    none: null,
  };

  const toneStyles = {
    neutral: riskStyles.none,
    success: riskStyles.low,
    warning: riskStyles.medium,
    danger: riskStyles.high,
  };

  const toneIcons = {
    neutral: null,
    success: icons.low,
    warning: icons.medium,
    danger: icons.high,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider',
        risk === 'none' ? toneStyles[tone] : riskStyles[risk],
        className
      )}
    >
      {risk === 'none' ? toneIcons[tone] : icons[risk]}
      {children}
    </span>
  );
};
