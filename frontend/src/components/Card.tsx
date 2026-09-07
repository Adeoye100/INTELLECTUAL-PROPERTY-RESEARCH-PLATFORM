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
    <div className={cn('bg-card text-card-foreground border border-border rounded-lg shadow-sm overflow-hidden', className)}>
      {title && (
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
      {footer && <div className="px-6 py-4 bg-muted border-t border-border text-muted-foreground">{footer}</div>}
    </div>
  );
};
