import React, { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search as SearchIcon, FileText, Link } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table, TableRow, TableCell } from '../../components/Table';
import { Modal } from '../../components/Modal';
import type { OfficeActionRef, PortfolioMark } from '../../types';

interface SearchFilters {
  markText: string;
  niceClass: string;
}

export const OfficeActionResearchScreen: React.FC = () => {
  const navigate = useNavigate();
  const [selectedOfficeAction, setSelectedOfficeAction] = useState<OfficeActionRef | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  const { register, handleSubmit, control } = useForm<SearchFilters>({
    defaultValues: {
      markText: '',
      niceClass: '',
    },
  });

  const markText = useWatch({ control, name: 'markText' });
  const niceClass = useWatch({ control, name: 'niceClass' });

  // Search office actions
  const { data: officeActions, isLoading, isError } = useQuery<OfficeActionRef[]>({
    queryKey: ['office-actions', markText, niceClass],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (markText) params.append('markText', markText);
      if (niceClass) params.append('niceClass', niceClass);
      
      const response = await fetch(`/api/office-actions/search?${params}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    enabled: markText.length > 0 || niceClass.length > 0,
  });

  // Get portfolio marks for linking
  const { data: portfolioMarks } = useQuery<PortfolioMark[]>({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const response = await fetch('/api/portfolio');
      if (!response.ok) throw new Error('Failed to fetch portfolio marks');
      return response.json();
    },
  });

  const onSubmit = (data: SearchFilters) => {
    console.log('Office Action search filters:', data);
  };

  const handleLinkOfficeAction = (officeAction: OfficeActionRef) => {
    setSelectedOfficeAction(officeAction);
    setIsLinkModalOpen(true);
  };

  const handleLinkToPortfolioMark = async (portfolioMarkId: string) => {
    if (!selectedOfficeAction) return;

    try {
      const response = await fetch('/api/office-actions/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officeActionId: selectedOfficeAction.id,
          portfolioMarkId,
        }),
      });

      if (response.ok) {
        setIsLinkModalOpen(false);
        setSelectedOfficeAction(null);
        // In a real app, we'd refetch the data here
        alert('Office action successfully linked to portfolio mark!');
      }
    } catch (error) {
      console.error('Failed to link office action:', error);
      alert('Failed to link office action. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Office Action Research</h1>
          <p className="text-text-secondary text-sm">Search historical examiner reasoning for precedent analysis</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="Search Filters" className="sticky top-24">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Mark Text</label>
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-forge-silver-500" />
                  <input
                    {...register('markText')}
                    className="w-full pl-9 pr-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-forge-teal-700 outline-none"
                    placeholder="e.g. FORGE"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Nice Class</label>
                <input
                  {...register('niceClass')}
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
          {(!markText && !niceClass) ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-forge-silver-300 rounded-lg bg-surface-card">
              <FileText className="w-12 h-12 text-forge-silver-300 mb-4" />
              <h3 className="text-lg font-semibold text-text-primary">Ready to Research</h3>
              <p className="text-text-secondary max-w-xs">
                Enter mark text or Nice class to search historical Office Actions and examiner reasoning.
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-forge-silver-100 animate-pulse rounded-lg"></div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-risk-high bg-risk-high/10 rounded-lg">
              Search encountered an error. Please try again.
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
                            <Link className="w-3 h-3 mr-1" />
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
              {portfolioMarks?.map((mark) => (
                <div 
                  key={mark.id}
                  className="p-3 border border-forge-silver-300 rounded cursor-pointer hover:bg-surface-base transition-colors"
                  onClick={() => handleLinkToPortfolioMark(mark.id)}
                >
                  <div className="font-medium text-text-primary">{mark.markText}</div>
                  <div className="text-xs text-text-secondary">
                    {mark.jurisdiction} | Classes: {mark.niceClasses.join(', ')} | Status: {mark.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
