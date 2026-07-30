import React from 'react';
import { cn } from '../lib/utils';

interface TableProps {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ headers, children, className }) => {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-forge-silver-300 bg-surface-base">
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wider">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-forge-silver-100">{children}</tbody>
      </table>
    </div>
  );
};

export const TableRow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <tr className={cn('hover:bg-surface-base transition-colors', className)}>{children}</tr>
);

export const TableCell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={cn('px-4 py-3 text-sm text-text-primary', className)}>{children}</td>
);
