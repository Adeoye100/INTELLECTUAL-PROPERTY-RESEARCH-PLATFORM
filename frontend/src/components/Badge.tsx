import React from 'react';
import { cn } from '../lib/utils';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

type RiskLevel = 'low' | 'medium' | 'high' | 'none';

interface BadgeProps {
  children: React.ReactNode;
  risk?: RiskLevel;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, risk = 'none', className }) => {
  const riskStyles = {
    low: 'bg-risk-low text-white',
    medium: 'bg-risk-medium text-white',
    high: 'bg-risk-high text-white',
    none: 'bg-forge-silver-300 text-text-primary',
  };

  const icons = {
    low: <CheckCircle className="w-3 h-3 mr-1" />,
    medium: <Info className="w-3 h-3 mr-1" />,
    high: <AlertCircle className="w-3 h-3 mr-1" />,
    none: null,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider',
        riskStyles[risk],
        className
      )}
    >
      {icons[risk]}
      {children}
    </span>
  );
};
