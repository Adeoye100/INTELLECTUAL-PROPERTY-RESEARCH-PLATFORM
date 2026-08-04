import React from 'react';
import { cn } from '../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className, title, footer }) => {
  return (
    <div className={cn('bg-surface-card border border-forge-silver-300 rounded-lg shadow-sm overflow-hidden', className)}>
      {title && (
        <div className="px-6 py-4 border-b border-forge-silver-300">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
      {footer && <div className="px-6 py-4 bg-surface-base border-t border-forge-silver-300">{footer}</div>}
    </div>
  );
};
