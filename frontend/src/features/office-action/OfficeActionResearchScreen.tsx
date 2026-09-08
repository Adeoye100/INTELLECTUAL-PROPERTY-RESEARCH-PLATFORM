import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Search as SearchIcon, FileText, RefreshCw, ExternalLink, Bookmark } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Table, TableRow, TableCell } from '../../components/Table';
import { Modal } from '../../components/Modal';
import type { OfficeActionSearchResponse, OfficeActionSearchResult, PortfolioMark, Matter } from '../../types';
import { listPortfolioMarks } from '../portfolio/portfolioApi';
import { createOfficeActionRef, linkOfficeActionToMatter, searchOfficeActions, type OfficeActionSearchRequest } from './officeActionApi';
import { getApiClient } from '../../lib/api/client';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  office_action: 'Office Action',
  non_final_office_action: 'Non-Final Office Action',
  final_office_action: 'Final Office Action',
  restriction_requirement: 'Restriction Requirement',
  suspension: 'Suspension',
  other: 'Other Document',
};

interface SearchFormInputs {
  markText: string;
  applicationNumber: string;
  owner: string;
  documentType: string;
  filedFrom: string;
  filedTo: string;
}

export const OfficeActionResearchScreen: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedOfficeAction, setSelectedOfficeAction] = useState<OfficeActionSearchResult | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkTargetType, setLinkTargetType] = useState<'portfolio' | 'matter'>('portfolio');
  const [submittedFilters, setSubmittedFilters] = useState<OfficeActionSearchRequest | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { register, handleSubmit, reset } = useForm<SearchFormInputs>({
    defaultValues: {
      markText: '',
      applicationNumber: '',
      owner: '',
      documentType: '',
      filedFrom: '',
      filedTo: '',
    },
  });

  const { data: searchResponse, isLoading, isError, refetch: retrySearch } = useQuery<OfficeActionSearchResponse>({
    queryKey: ['office-actions', submittedFilters],
    queryFn: () => searchOfficeActions(submittedFilters!),
    enabled: submittedFilters !== null,
    retry: false,
  });

  const officeActions = searchResponse?.results ?? [];
  const sourceStatuses = searchResponse?.sourceStatuses ?? [];
  const isSourceUnavailable = searchResponse?.partial || sourceStatuses.some((s) => s.status === 'unavailable');

  // Load portfolio marks
  const portfolioMarksQuery = useQuery<PortfolioMark[]>({
    queryKey: ['portfolio'],
    queryFn: () => listPortfolioMarks().then((res) => res.items),
    enabled: isLinkModalOpen && linkTargetType === 'portfolio',
  });

  // Load matters for linking
  const mattersQuery = useQuery<Matter[]>({
    queryKey: ['matters'],
    queryFn: () => getApiClient().requestJson<{ items: Matter[] }>('/matters').then((res) => res.items),
    enabled: isLinkModalOpen && linkTargetType === 'matter',
  });

  const onSubmit = (data: SearchFormInputs) => {
    setValidationMessage(null);
    const cleaned: OfficeActionSearchRequest = {
      markText: data.markText.trim() || undefined,
      applicationNumber: data.applicationNumber.trim() || undefined,
      owner: data.owner.trim() || undefined,
      documentType: data.documentType || undefined,
      filedFrom: data.filedFrom || undefined,
      filedTo: data.filedTo || undefined,
    };

    if (!cleaned.markText && !cleaned.applicationNumber && !cleaned.owner && !cleaned.documentType && !cleaned.filedFrom && !cleaned.filedTo) {
      setValidationMessage('Enter at least one search criterion.');
      return;
    }

    setSubmittedFilters(cleaned);
  };

  const portfolioLinkMutation = useMutation({
    mutationFn: ({ portfolioMarkId, item }: { portfolioMarkId: string; item: OfficeActionSearchResult }) =>
      createOfficeActionRef(portfolioMarkId, item),
    onSuccess: async () => {
      setIsLinkModalOpen(false);
      setSelectedOfficeAction(null);
      setLinkMessage({ type: 'success', text: 'Office Action reference linked to the selected portfolio mark.' });
      await queryClient.invalidateQueries({ queryKey: ['office-actions'] });
    },
    onError: (err) => setLinkMessage({ type: 'error', text: err instanceof Error ? err.message : 'The Office Action could not be linked. Please retry.' }),
  });

  const matterLinkMutation = useMutation({
    mutationFn: async ({ matterId, item }: { matterId: string; item: OfficeActionSearchResult }) => {
      // First save reference under portfolio/firm scope
      const dummyMarkId = portfolioMarksQuery.data?.[0]?.id || '00000000-0000-0000-0000-000000000001';
      const ref = await createOfficeActionRef(dummyMarkId, item);
      return linkOfficeActionToMatter(matterId, ref.id);
    },
    onSuccess: async () => {
      setIsLinkModalOpen(false);
      setSelectedOfficeAction(null);
      setLinkMessage({ type: 'success', text: 'Office Action reference linked to the selected matter.' });
      await queryClient.invalidateQueries({ queryKey: ['matters'] });
    },
    onError: (err) => setLinkMessage({ type: 'error', text: err instanceof Error ? err.message : 'The Office Action could not be linked to matter. Please retry.' }),
  });

  const handleLinkClick = (officeAction: OfficeActionSearchResult) => {
    setLinkMessage(null);
    setSelectedOfficeAction(officeAction);
    setIsLinkModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Back to previous page">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Action Research</h1>
          <p className="text-muted-foreground text-sm">Search historical USPTO trademark examiner reasoning for precedent analysis</p>
        </div>
      </header>

      {linkMessage && (
        <div role={linkMessage.type === 'error' ? 'alert' : 'status'} className={`rounded border p-4 ${linkMessage.type === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-emerald-500/40 bg-emerald-500/10 text-foreground'}`}>
          {linkMessage.text}
        </div>
      )}

      {validationMessage && (
        <div role="alert" className="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-amber-600 dark:text-amber-400">
          {validationMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="Search Filters" className="lg:sticky lg:top-24">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="oa-mark" className="block text-xs font-bold text-muted-foreground uppercase mb-1">Mark Text</label>
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    {...register('markText')}
                    id="oa-mark"
                    className="w-full pl-9 pr-3 py-2 border border-input bg-background text-foreground placeholder:text-muted-foreground rounded focus:ring-2 focus:ring-ring outline-none text-sm"
                    placeholder="e.g. FORGE"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="oa-app-num" className="block text-xs font-bold text-muted-foreground uppercase mb-1">Application Number</label>
                <input
                  {...register('applicationNumber')}
                  id="oa-app-num"
                  className="w-full px-3 py-2 border border-input bg-background text-foreground placeholder:text-muted-foreground rounded focus:ring-2 focus:ring-ring outline-none text-sm"
                  placeholder="e.g. 88123456"
                />
              </div>

              <div>
                <label htmlFor="oa-owner" className="block text-xs font-bold text-muted-foreground uppercase mb-1">Owner Name</label>
                <input
                  {...register('owner')}
                  id="oa-owner"
                  className="w-full px-3 py-2 border border-input bg-background text-foreground placeholder:text-muted-foreground rounded focus:ring-2 focus:ring-ring outline-none text-sm"
                  placeholder="e.g. Forge Global"
                />
              </div>

              <div>
                <label htmlFor="oa-doc-type" className="block text-xs font-bold text-muted-foreground uppercase mb-1">Document Type</label>
                <select
                  {...register('documentType')}
                  id="oa-doc-type"
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded focus:ring-2 focus:ring-ring outline-none text-sm"
                >
                  <option value="">All Document Types</option>
                  <option value="non_final_office_action">Non-Final Office Action</option>
                  <option value="final_office_action">Final Office Action</option>
                  <option value="restriction_requirement">Restriction Requirement</option>
                  <option value="suspension">Suspension</option>
                  <option value="office_action">Office Action</option>
                  <option value="other">Other Document</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="oa-from" className="block text-xs font-bold text-muted-foreground uppercase mb-1">From Date</label>
                  <input
                    {...register('filedFrom')}
                    id="oa-from"
                    type="date"
                    className="w-full px-2 py-1.5 border border-input bg-background text-foreground rounded text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor="oa-to" className="block text-xs font-bold text-muted-foreground uppercase mb-1">To Date</label>
                  <input
                    {...register('filedTo')}
                    id="oa-to"
                    type="date"
                    className="w-full px-2 py-1.5 border border-input bg-background text-foreground rounded text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" className="w-full">Apply Filters</Button>
                <Button type="button" variant="outline" onClick={() => { reset(); setSubmittedFilters(null); setValidationMessage(null); }}>Reset</Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Results Main Area */}
        <div className="lg:col-span-3 space-y-4">
          {submittedFilters === null ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-lg bg-card text-card-foreground">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-foreground">Ready to Research</h3>
              <p className="text-muted-foreground max-w-xs text-sm">
                Enter mark text, application number, or owner to search historical USPTO Office Actions and examiner reasoning.
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-4" role="status" aria-label="Loading office action precedents">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted animate-pulse motion-reduce:animate-none rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-destructive bg-destructive/10 rounded-lg" role="alert">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
              <p>Office Action search encountered an error. No precedent results are presented as current.</p>
              <Button className="mt-4" variant="outline" onClick={() => void retrySearch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry search</Button>
            </div>
          ) : isSourceUnavailable ? (
            <div className="p-8 text-center text-amber-600 bg-amber-500/10 rounded-lg border border-amber-500/20" role="alert">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
              <p className="font-medium">Office Action source is temporarily unavailable.</p>
              <p className="text-xs text-muted-foreground mt-1">Some or all registry sources could not be reached. Please retry shortly.</p>
              <Button className="mt-4" variant="outline" onClick={() => void retrySearch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry search</Button>
            </div>
          ) : officeActions.length === 0 ? (
            <div className="p-12 text-center bg-card text-card-foreground rounded-lg border border-border">
              <p className="font-medium">No Office Actions matched these criteria.</p>
              <p className="text-xs text-muted-foreground mt-1">Try broadening your search parameters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
                <span>Showing {officeActions.length} Office Action records</span>
                <span>Newest Office Actions first</span>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <Table headers={['Reference', 'Examiner Reasoning', 'Document Type', 'Actions']}>
                    {officeActions.map((officeAction) => (
                      <TableRow key={`${officeAction.sourceRegistry}-${officeAction.sourceReferenceId}`}>
                        <TableCell className="max-w-xs">
                          <div className="font-medium text-foreground mb-1">
                            {officeAction.markText ? `${officeAction.markText} ` : ''}({officeAction.sourceRegistry || 'USPTO'}{officeAction.applicationNumber ? ` #${officeAction.applicationNumber}` : ''})
                          </div>
                          {officeAction.owner && <div className="text-xs text-muted-foreground">Owner: {officeAction.owner}</div>}
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{officeAction.sourceReferenceId}</div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          {officeAction.examinerReasoningSummary ? (
                            <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">
                              {officeAction.examinerReasoningSummary}
                            </p>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              Examiner reasoning text is not available from this source record.
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold text-foreground">
                            {DOCUMENT_TYPE_LABELS[officeAction.documentType] || officeAction.documentType || 'Office Action'}
                          </span>
                          {officeAction.officeActionDate && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5">{officeAction.officeActionDate}</span>
                          )}
                          {officeAction.sourceDocumentUrl && (
                            <a
                              href={officeAction.sourceDocumentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary underline mt-1"
                            >
                              <span>View source document</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLinkClick(officeAction)}
                            aria-label="Link to Mark"
                          >
                            <Bookmark className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Link Precedent
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Link Precedent Modal */}
      <Modal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title="Link Precedent to Firm Work"
        footer={
          <Button variant="secondary" onClick={() => setIsLinkModalOpen(false)}>
            Cancel
          </Button>
        }
      >
        <div className="space-y-4">
          {selectedOfficeAction && (
            <div className="p-4 bg-muted/40 rounded border border-border">
              <h4 className="font-bold text-foreground text-sm mb-1">Selected Office Action</h4>
              <p className="text-sm font-medium text-foreground">
                {selectedOfficeAction.markText || 'Mark'} ({selectedOfficeAction.sourceRegistry} {selectedOfficeAction.applicationNumber || selectedOfficeAction.sourceReferenceId})
              </p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {selectedOfficeAction.examinerReasoningSummary || 'No reasoning text.'}
              </p>
            </div>
          )}

          <div className="flex border-b border-border">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${linkTargetType === 'portfolio' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setLinkTargetType('portfolio')}
            >
              Link to Portfolio Mark
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${linkTargetType === 'matter' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setLinkTargetType('matter')}
            >
              Link to Matter Case File
            </button>
          </div>

          {linkTargetType === 'portfolio' ? (
            <div className="space-y-2">
              <h4 className="font-bold text-foreground text-xs uppercase text-muted-foreground">Select Portfolio Mark</h4>
              {portfolioMarksQuery.isLoading && <p className="text-sm text-muted-foreground" role="status">Loading portfolio marks…</p>}
              {portfolioMarksQuery.isError && (
                <div role="alert" className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                  <p>Portfolio marks could not be loaded.</p>
                  <Button size="sm" className="mt-2" onClick={() => void portfolioMarksQuery.refetch()}>Retry portfolio</Button>
                </div>
              )}
              {!portfolioMarksQuery.isLoading && !portfolioMarksQuery.isError && portfolioMarksQuery.data?.length === 0 && (
                <p className="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No portfolio marks are available to link.</p>
              )}
              {portfolioMarksQuery.data?.map((mark) => (
                <button
                  type="button"
                  key={mark.id}
                  className="w-full p-3 border border-border rounded text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                  onClick={() => selectedOfficeAction && portfolioLinkMutation.mutate({ portfolioMarkId: mark.id, item: selectedOfficeAction })}
                  disabled={portfolioLinkMutation.isPending}
                >
                  <div className="font-medium text-foreground text-sm">{mark.markText}</div>
                  <div className="text-xs text-muted-foreground">
                    {mark.jurisdiction} | Classes: {mark.niceClasses?.join(', ') || 'N/A'} | Status: {mark.status}
                  </div>
                </button>
              ))}
              {portfolioLinkMutation.isPending && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">Linking office action to mark…</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <h4 className="font-bold text-foreground text-xs uppercase text-muted-foreground">Select Matter Case File</h4>
              {mattersQuery.isLoading && <p className="text-sm text-muted-foreground" role="status">Loading matter case files…</p>}
              {mattersQuery.isError && (
                <div role="alert" className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                  <p>Matters could not be loaded.</p>
                  <Button size="sm" className="mt-2" onClick={() => void mattersQuery.refetch()}>Retry matters</Button>
                </div>
              )}
              {!mattersQuery.isLoading && !mattersQuery.isError && mattersQuery.data?.length === 0 && (
                <p className="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No matter case files are available to link.</p>
              )}
              {mattersQuery.data?.map((matter) => (
                <button
                  type="button"
                  key={matter.id}
                  className="w-full p-3 border border-border rounded text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                  onClick={() => selectedOfficeAction && matterLinkMutation.mutate({ matterId: matter.id, item: selectedOfficeAction })}
                  disabled={matterLinkMutation.isPending}
                >
                  <div className="font-medium text-foreground text-sm">{matter.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Client Ref: {matter.clientRef || 'N/A'} | Created: {new Date(matter.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
              {matterLinkMutation.isPending && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">Linking office action to matter…</p>}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

