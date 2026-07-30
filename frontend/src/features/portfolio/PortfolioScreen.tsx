import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, AlertCircle, Shield, ExternalLink, Calendar } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Table, TableRow, TableCell } from '../../components/Table';
import type { PortfolioMark } from '../../types';

export const PortfolioScreen: React.FC = () => {
  const { data: marks, isLoading } = useQuery<PortfolioMark[]>({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const response = await fetch('/api/portfolio');
      return response.json();
    },
  });

  if (isLoading) return <div className="p-8 text-center">Loading portfolio...</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Protected Portfolio</h1>
          <p className="text-text-secondary text-sm">Managed trademarks and intellectual property assets</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Mark
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-forge-navy-950 text-white border-none">
          <div className="text-[10px] text-forge-subtext-onDark uppercase font-bold mb-1">Total Assets</div>
          <div className="text-3xl font-black">24</div>
          <div className="text-xs text-forge-subtext-onDark mt-2 flex items-center gap-1">
            <Shield className="w-3 h-3" /> 18 Marks Watched
          </div>
        </Card>
        <Card>
          <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Upcoming Renewals</div>
          <div className="text-3xl font-black text-risk-medium">3</div>
          <div className="text-xs text-text-secondary mt-2 flex items-center gap-1 text-risk-medium font-bold">
            <AlertCircle className="w-3 h-3" /> Action required within 90 days
          </div>
        </Card>
        <Card>
          <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Active Watches</div>
          <div className="text-3xl font-black text-forge-teal-700">12</div>
          <div className="text-xs text-text-secondary mt-2">Monitoring 142 international registries</div>
        </Card>
      </div>

      <Card>
        <Table headers={['Mark', 'Jurisdiction', 'Classes', 'Status', 'Renewal Date', 'Actions']}>
          {marks?.map((mark) => (
            <TableRow key={mark.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-forge-silver-500" />
                  <span className="font-bold uppercase font-mono">{mark.markText}</span>
                </div>
              </TableCell>
              <TableCell>{mark.jurisdiction}</TableCell>
              <TableCell>{mark.niceClasses.join(', ')}</TableCell>
              <TableCell>
                <Badge>{mark.status}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                   <Calendar className="w-4 h-4 text-text-secondary" />
                   {mark.renewalDate}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">Details</Button>
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!marks || marks.length === 0) && (
             <TableRow>
               <TableCell className="text-center py-8" >
                 No marks found in your portfolio.
               </TableCell>
             </TableRow>
          )}
        </Table>
      </Card>
    </div>
  );
};
