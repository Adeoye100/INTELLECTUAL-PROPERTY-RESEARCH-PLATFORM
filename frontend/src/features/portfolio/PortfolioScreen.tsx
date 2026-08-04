import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, AlertCircle, Shield, ExternalLink, Calendar, MoveHorizontal } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Table, TableRow, TableCell } from '../../components/Table';
import type { PortfolioMark } from '../../types';
import { PdfExport } from '../../components/PdfExport';
import { Modal } from '../../components/Modal';
import { useAuthStore } from '../auth/authStore';
import { useOnboardingStore } from '../onboarding/onboardingStore';

const portfolioMarkSchema = z.object({
  markText: z.string().trim().min(2, 'Enter the trademark name.'),
  jurisdiction: z.string().min(2, 'Choose a jurisdiction.'),
  niceClasses: z.string().trim().regex(/^\d+(\s*,\s*\d+)*$/, 'Enter one or more numeric classes separated by commas.'),
  renewalDate: z.string().min(1, 'Choose the next renewal date.'),
});

type PortfolioMarkValues = z.infer<typeof portfolioMarkSchema>;

export const PortfolioScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const completePath = useOnboardingStore((state) => state.completePath);
  const [isAddOpen, setIsAddOpen] = React.useState(() => searchParams.get('onboarding') === 'add' && user?.role !== 'viewer');
  const [addError, setAddError] = React.useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PortfolioMarkValues>({ resolver: zodResolver(portfolioMarkSchema) });
  const { data: marks, isLoading } = useQuery<PortfolioMark[]>({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const response = await fetch('/api/portfolio');
      return response.json();
    },
  });

  const addMark = async (values: PortfolioMarkValues) => {
    setAddError(null);
    try {
      const response = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          niceClasses: values.niceClasses.split(',').map((value) => Number(value.trim())),
        }),
      });
      if (!response.ok) throw new Error('Portfolio creation failed');
      const created = await response.json() as PortfolioMark;
      queryClient.setQueryData<PortfolioMark[]>(['portfolio'], (current = []) => [...current, created]);
      if (user && searchParams.get('onboarding') === 'add') {
        completePath(user.id, 'portfolio');
        setOnboardingComplete(true);
      }
      reset();
      setIsAddOpen(false);
    } catch {
      setAddError('The mark could not be added. Check your connection and retry.');
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading portfolio...</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between md:max-xl:flex-col md:max-xl:items-stretch md:max-xl:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Protected Portfolio</h1>
          <p className="text-text-secondary text-sm">Managed trademarks and intellectual property assets</p>
        </div>
        <div className="flex flex-wrap items-start gap-3 md:max-xl:self-start">
          <PdfExport
            request={{
              reportType: 'portfolio-summary',
              context: {
                screen: 'portfolio',
                markIds: marks?.map((mark) => mark.id) ?? [],
                firmId: marks?.[0]?.firmId,
              },
            }}
            disabled={!marks?.length}
            label="Export portfolio PDF"
          />
          {user?.role !== 'viewer' && (
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              Add mark
            </Button>
          )}
        </div>
      </header>

      {onboardingComplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-forge-teal-700 bg-forge-teal-700/10 p-4" role="status">
          <p className="font-bold text-text-primary">First portfolio mark added on this browser.</p>
          <Link to="/dashboard" className="font-bold text-forge-teal-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Continue to dashboard</Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
        <div className="mb-3 hidden items-center gap-2 text-xs font-semibold text-text-secondary md:max-xl:flex">
          <MoveHorizontal className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>Scroll horizontally to review all portfolio columns.</span>
        </div>
        <Table
          headers={['Mark', 'Jurisdiction', 'Classes', 'Status', 'Renewal Date', 'Actions']}
          className="md:max-xl:overscroll-x-contain md:max-xl:[&>table]:min-w-[48rem]"
        >
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

      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add a portfolio mark"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" form="add-portfolio-mark" disabled={isSubmitting}>{isSubmitting ? 'Adding…' : addError ? 'Retry adding mark' : 'Add mark'}</Button>
          </>
        )}
      >
        <form id="add-portfolio-mark" onSubmit={handleSubmit(addMark)} className="space-y-4" noValidate>
          <div><label htmlFor="portfolio-mark-text" className="mb-1 block text-sm font-bold text-text-primary">Trademark name</label><input {...register('markText')} id="portfolio-mark-text" autoFocus aria-invalid={Boolean(errors.markText)} aria-describedby={errors.markText ? 'portfolio-mark-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />{errors.markText && <p id="portfolio-mark-error" className="mt-1 text-xs text-risk-high">{errors.markText.message}</p>}</div>
          <div><label htmlFor="portfolio-jurisdiction" className="mb-1 block text-sm font-bold text-text-primary">Jurisdiction</label><select {...register('jurisdiction')} id="portfolio-jurisdiction" defaultValue="" aria-invalid={Boolean(errors.jurisdiction)} aria-describedby={errors.jurisdiction ? 'portfolio-jurisdiction-error' : undefined} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"><option value="" disabled>Choose jurisdiction</option><option value="US">United States</option><option value="EU">European Union</option><option value="GB">United Kingdom</option></select>{errors.jurisdiction && <p id="portfolio-jurisdiction-error" className="mt-1 text-xs text-risk-high">{errors.jurisdiction.message}</p>}</div>
          <div><label htmlFor="portfolio-classes" className="mb-1 block text-sm font-bold text-text-primary">Nice classes</label><input {...register('niceClasses')} id="portfolio-classes" placeholder="9, 35, 42" aria-invalid={Boolean(errors.niceClasses)} aria-describedby={errors.niceClasses ? 'portfolio-classes-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />{errors.niceClasses && <p id="portfolio-classes-error" className="mt-1 text-xs text-risk-high">{errors.niceClasses.message}</p>}</div>
          <div><label htmlFor="portfolio-renewal" className="mb-1 block text-sm font-bold text-text-primary">Next renewal date</label><input {...register('renewalDate')} id="portfolio-renewal" type="date" aria-invalid={Boolean(errors.renewalDate)} aria-describedby={errors.renewalDate ? 'portfolio-renewal-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />{errors.renewalDate && <p id="portfolio-renewal-error" className="mt-1 text-xs text-risk-high">{errors.renewalDate.message}</p>}</div>
          {addError && <p className="rounded bg-risk-high/10 p-3 text-sm text-risk-high" role="alert">{addError}</p>}
        </form>
      </Modal>
    </div>
  );
};
