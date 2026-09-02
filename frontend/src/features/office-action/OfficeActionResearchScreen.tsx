import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Search as SearchIcon, FileText, Link, RefreshCw } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table, TableRow, TableCell } from '../../components/Table';
import { Modal } from '../../components/Modal';
import type { OfficeActionRef, PortfolioMark } from '../../types';
import { listPortfolioMarks } from '../portfolio/portfolioApi';
import { linkOfficeAction, searchOfficeActions } from './officeActionApi';

interface SearchFilters {
  markText: string;
  niceClass: string;
}

export const OfficeActionResearchScreen: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedOfficeAction, setSelectedOfficeAction] = useState<OfficeActionRef | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [submittedFilters, setSubmittedFilters] = useState<SearchFilters | null>(null);
  const [linkMessage, setLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { register, handleSubmit } = useForm<SearchFilters>({
    defaultValues: {
      markText: '',
      niceClass: '',
    },
  });

  const { data: officeActions, isLoading, isError, refetch: retrySearch } = useQuery<OfficeActionRef[]>({
    queryKey: ['office-actions', submittedFilters],
    queryFn: () => searchOfficeActions(submittedFilters!),
    enabled: submittedFilters !== null,
    retry: false,
  });

  // Get portfolio marks for linking
  const portfolioMarks = useQuery<PortfolioMark[]>({
    queryKey: ['portfolio'],
    queryFn: () => listPortfolioMarks().then((response) => response.items),
  });

  const onSubmit = (data: SearchFilters) => setSubmittedFilters({
    markText: data.markText.trim(),
    niceClass: data.niceClass.trim(),
  });

  const linkMutation = useMutation({
    mutationFn: ({ officeActionId, portfolioMarkId }: { officeActionId: string; portfolioMarkId: string }) => linkOfficeAction(officeActionId, portfolioMarkId),
    onSuccess: async () => {
      setIsLinkModalOpen(false);
      setSelectedOfficeAction(null);
      setLinkMessage({ type: 'success', text: 'Office action linked to the selected portfolio mark.' });
      await queryClient.invalidateQueries({ queryKey: ['office-actions'] });
    },
    onError: (error) => setLinkMessage({ type: 'error', text: error instanceof Error ? error.message : 'The office action could not be linked. Please retry.' }),
  });

  const handleLinkOfficeAction = (officeAction: OfficeActionRef) => {
    setLinkMessage(null);
    setSelectedOfficeAction(officeAction);
    setIsLinkModalOpen(true);
  };

  const handleLinkToPortfolioMark = (portfolioMarkId: string) => {
    if (!selectedOfficeAction) return;
    linkMutation.mutate({ officeActionId: selectedOfficeAction.id, portfolioMarkId });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Back to previous page">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Office Action Research</h1>
          <p className="text-text-secondary text-sm">Search historical examiner reasoning for precedent analysis</p>
        </div>
      </header>

      {linkMessage && <div role={linkMessage.type === 'error' ? 'alert' : 'status'} className={`rounded border p-4 ${linkMessage.type === 'error' ? 'border-risk-high/40 bg-risk-high/10 text-risk-high' : 'border-risk-low/40 bg-risk-low/10 text-text-primary'}`}>{linkMessage.text}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="Search Filters" className="sticky top-24">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="office-action-mark" className="block text-xs font-bold text-text-secondary uppercase mb-1">Mark Text</label>
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-forge-silver-500" aria-hidden="true" />
                  <input
                    {...register('markText')}
                    id="office-action-mark"
                    className="w-full pl-9 pr-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-forge-teal-700 outline-none"
                    placeholder="e.g. FORGE"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="office-action-class" className="block text-xs font-bold text-text-secondary uppercase mb-1">Nice Class</label>
                <input
                  {...register('niceClass')}
                  id="office-action-class"
                  className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-forge-teal-700 outline-none"
                  placeholder="e.g. 9, 35, 42"
                />
              </div>

              <Button type="submit" className="w-full">Apply Filters</Button>
            </form>
          </Card>
        </div>

        {/* Results Main Area */}
        <div className="lg:col-span-3 space-y-4">
          {submittedFilters === null ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-forge-silver-300 rounded-lg bg-surface-card">
              <FileText className="w-12 h-12 text-forge-silver-300 mb-4" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-text-primary">Ready to Research</h3>
              <p className="text-text-secondary max-w-xs">
                Enter mark text or Nice class to search historical Office Actions and examiner reasoning.
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-4" role="status" aria-label="Loading office action precedents">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-forge-silver-100 animate-pulse motion-reduce:animate-none rounded-lg"></div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-risk-high bg-risk-high/10 rounded-lg" role="alert">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
              <p>Search encountered an error. No precedent results are being presented as current.</p>
              <Button className="mt-4" variant="outline" onClick={() => void retrySearch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry search</Button>
            </div>
          ) : officeActions?.length === 0 ? (
            <div className="p-12 text-center bg-surface-card rounded-lg border border-forge-silver-300">
              No Office Actions found. Try different search criteria.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-text-secondary px-2">
                <span>Showing {officeActions?.length} Office Action precedents</span>
                <span>Sorted by relevance</span>
              </div>
              
              <Card>
                <Table headers={['Reference', 'Examiner Reasoning', 'Status', 'Actions']}>
                  {officeActions?.map((officeAction) => (
                    <TableRow key={officeAction.id}>
                      <TableCell className="max-w-xs">
                        <div className="font-medium text-text-primary mb-1">
                          {officeAction.referenceText}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="text-sm text-text-secondary line-clamp-3">
                          {officeAction.examinerReasoningSummary}
                        </p>
                      </TableCell>
                      <TableCell>
                        {officeAction.portfolioMarkId ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-forge-teal-100 text-forge-teal-700">
                            <Link className="w-3 h-3 mr-1" aria-hidden="true" />
                            LINKED
                          </span>
                        ) : (
                          <span className="text-text-secondary text-xs">Available</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleLinkOfficeAction(officeAction)}
                          disabled={!!officeAction.portfolioMarkId}
                        >
                          {officeAction.portfolioMarkId ? 'Already Linked' : 'Link to Case File'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </Table>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Link to Case File Modal */}
      <Modal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title="Link to Case File"
        footer={
          <Button variant="secondary" onClick={() => setIsLinkModalOpen(false)}>
            Cancel
          </Button>
        }
      >
        <div className="space-y-4">
          {selectedOfficeAction && (
            <div className="p-4 bg-surface-base rounded border">
              <h4 className="font-bold text-text-primary mb-2">Selected Office Action</h4>
              <p className="text-sm font-medium">{selectedOfficeAction.referenceText}</p>
              <p className="text-xs text-text-secondary mt-1">
                {selectedOfficeAction.examinerReasoningSummary.substring(0, 150)}...
              </p>
            </div>
          )}
          
          <div>
            <h4 className="font-bold text-text-primary mb-3">Select Portfolio Mark</h4>
            <div className="space-y-2">
              {portfolioMarks.isLoading && <p role="status">Loading portfolio marks…</p>}
              {portfolioMarks.isError && <div role="alert" className="rounded bg-risk-high/10 p-3"><p>Portfolio marks could not be loaded.</p><Button size="sm" className="mt-2" onClick={() => void portfolioMarks.refetch()}>Retry portfolio</Button></div>}
              {!portfolioMarks.isLoading && !portfolioMarks.isError && portfolioMarks.data?.length === 0 && <p className="rounded border border-dashed border-forge-silver-300 p-4 text-center text-text-secondary">No portfolio marks are available to link.</p>}
              {portfolioMarks.data?.map((mark) => (
                <button
                  type="button"
                  key={mark.id}
                  className="w-full p-3 border border-forge-silver-300 rounded text-left hover:bg-surface-base transition-colors disabled:opacity-50"
                  onClick={() => handleLinkToPortfolioMark(mark.id)}
                  disabled={linkMutation.isPending}
                >
                  <div className="font-medium text-text-primary">{mark.markText}</div>
                  <div className="text-xs text-text-secondary">
                    {mark.jurisdiction} | Classes: {mark.niceClasses.join(', ')} | Status: {mark.status}
                  </div>
                </button>
              ))}
              {linkMutation.isPending && <p role="status" aria-live="polite">Linking office action…</p>}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
