import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  BookOpen,
  FolderOpen,
  Trash2,
  Info,
  Loader2,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PdfExport } from '../../components/PdfExport';
import { Modal } from '../../components/Modal';
import { MatterSelectionModal } from './MatterSelectionModal';
import { useAuthStore } from '../auth/authStore';
import type {
  SearchResponse,
  RiskDetailRouteState,
  RiskLevel,
  Matter,
  MatterSaveRequest,
} from '../../types';
import { cn } from '../../lib/utils';
import { getSearchResult } from './searchApi';
import { ConfusionRiskBreakdown } from './ConfusionRiskBreakdown';
import { RiskBadge } from '../../components/visualization/ChartPrimitives';

// ---------------------------------------------------------------------------
// Risk level presentation helpers
// ---------------------------------------------------------------------------

interface RiskPresentation {
  label: string;
  colour: string;           // Tailwind text class
  border: string;           // Tailwind border class
  bg: string;               // Tailwind background class
  Icon: React.FC<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
}

const riskPresentation: Record<RiskLevel, RiskPresentation> = {
  high: {
    label: 'HIGH',
    colour: 'text-risk-high',
    border: 'border-risk-high',
    bg: 'bg-risk-high/10',
    Icon: ShieldOff,
  },
  medium: {
    label: 'MEDIUM',
    colour: 'text-risk-medium',
    border: 'border-risk-medium',
    bg: 'bg-risk-medium/10',
    Icon: ShieldAlert,
  },
  low: {
    label: 'LOW',
    colour: 'text-risk-low',
    border: 'border-risk-low',
    bg: 'bg-risk-low/10',
    Icon: ShieldCheck,
  },
};

// ---------------------------------------------------------------------------
// Discard confirmation modal
// ---------------------------------------------------------------------------

interface DiscardConfirmModalProps {
  isOpen: boolean;
  candidateMarkText: string;
  onConfirm: () => void;
  onClose: () => void;
}

const DiscardConfirmModal: React.FC<DiscardConfirmModalProps> = ({
  isOpen,
  candidateMarkText,
  onConfirm,
  onClose,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Discard this result?"
    footer={
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onClose}>
          Keep result
        </Button>
        <Button
          className="bg-risk-high text-white hover:bg-risk-high/80"
          onClick={onConfirm}
        >
          Discard result
        </Button>
      </div>
    }
  >
    <p className="text-text-secondary">
      You are about to discard the risk analysis for{' '}
      <strong className="font-mono text-text-primary">{candidateMarkText}</strong>. This removes it
      from your current session view. If this result was sourced from a live query it may reappear
      on the next search.
    </p>
    <p className="mt-3 text-sm text-text-secondary">
      <strong>Note:</strong> Discarding a result does not file any legal action and does not affect
      any matter or portfolio records that already include this result.
    </p>
  </Modal>
);

// ---------------------------------------------------------------------------
// Action panel state types
// ---------------------------------------------------------------------------

type ActionStatus =
  | { type: 'idle' }
  | { type: 'saving-matter' }
  | { type: 'matter-saved'; matter: Matter; created: boolean }
  | { type: 'matter-error'; message: string }
  | { type: 'discarded' };

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export const RiskDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const role = user?.role ?? 'viewer';
  const canActOnResult = role === 'admin' || role === 'attorney';

  // Route state passed by SearchScreen via Link state.
  // Will be null on a direct page refresh or bookmark navigation.
  const routeState = location.state as RiskDetailRouteState | null;

  // API fallback: only fires when route state is absent (direct refresh, bookmark).
  const { data: searchResponse, isLoading: isFetching } = useQuery<SearchResponse>({
    queryKey: ['search-result', id],
    queryFn: () => getSearchResult(id ?? ''),
    // Only hit the API if route state is absent
    enabled: routeState === null,
  });

  // Prefer route state; fall back to API cache
  const result = routeState?.result ?? searchResponse?.results.find((r) => r.id === id);
  const proposedMark = routeState?.proposedMark;
  const isLoading = routeState === null && isFetching;

  // UI state
  const [matterModalOpen, setMatterModalOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<ActionStatus>({ type: 'idle' });
  const [discarded, setDiscarded] = useState(false);

  // ---- Derived ----
  const score = result?.riskAnalysis ?? result?.riskScore;
  const rp = score ? riskPresentation[score.compositeRating] : null;


  // ---- Handlers ----
  const handleMatterSaved = (matter: Matter, created: boolean) => {
    setActionStatus({ type: 'matter-saved', matter, created });
    setMatterModalOpen(false);
  };

  const handleDiscard = () => {
    setDiscardModalOpen(false);
    setDiscarded(true);
    setActionStatus({ type: 'discarded' });
  };

  const matterSaveRequest: Omit<MatterSaveRequest, 'matterId' | 'newMatterName' | 'newMatterClientRef'> | null =
    result && score
      ? {
          resultId: result.id,
          candidateMarkText: result.candidateMarkText,
          riskScoreSnapshot: {
            compositeRating: score.compositeRating,
            phoneticScore: score.phoneticScore,
            visualScore: score.visualScore,
            conceptualScore: score.conceptualScore,
            classOverlap: score.classOverlap,
          },
        }
      : null;

  // ---- Loading / not found states ----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-secondary" role="status" aria-label="Loading risk analysis">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" />
        Loading risk analysis…
      </div>
    );
  }

  if (!result || !score) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="rounded-lg border border-forge-silver-300 bg-surface-card p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-risk-medium" aria-hidden="true" />
          <h2 className="text-lg font-bold text-text-primary">Result not found</h2>
          <p className="mt-1 text-sm text-text-secondary">
            This result is no longer in the current search session.{' '}
            {routeState === null &&
              'A direct page refresh requires a new search — the result is not cached.'}
          </p>
          <Button className="mt-4" onClick={() => navigate('/search')}>
            Return to search
          </Button>
        </div>
      </div>
    );
  }

  if (discarded) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="rounded-lg border border-forge-silver-300 bg-surface-card p-12 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-risk-low" aria-hidden="true" />
          <h2 className="text-lg font-bold text-text-primary">Result discarded</h2>
          <p className="mt-1 text-sm text-text-secondary">
            The analysis for{' '}
            <span className="font-mono font-semibold">{result.candidateMarkText}</span> has been
            removed from your session view.
          </p>
          <Button className="mt-4" onClick={() => navigate('/search')}>
            Return to search
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            aria-label="Back to search results"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Confusion Risk Analysis</h1>
            <p className="text-sm text-text-secondary">
              Detailed comparison and scored evidence breakdown
            </p>
          </div>
        </div>

        {/* Data source banner */}
        {routeState === null && (
          <div className="flex items-center gap-1.5 rounded border border-forge-silver-300 bg-surface-base px-3 py-1.5 text-xs text-text-secondary">
            <Info className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            Loaded via API fallback (direct navigation). Data reflects last registry query.
          </div>
        )}
      </header>

      {/* ---- Action status banner ---- */}
      {actionStatus.type === 'matter-saved' && (
        <div
          role="status"
          className="flex items-center gap-2 rounded border border-forge-teal-700/40 bg-forge-teal-700/10 px-4 py-3 text-sm text-forge-teal-700"
        >
          <CheckCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            {actionStatus.created ? 'New matter created and result saved' : 'Result saved to matter'}:{' '}
            <strong>{actionStatus.matter.name}</strong>
            {actionStatus.matter.clientRef && (
              <> &mdash; Ref: <span className="font-mono">{actionStatus.matter.clientRef}</span></>
            )}
            <span className="ml-2 text-risk-medium">(mock-only: browser storage, not server)</span>
          </span>
        </div>
      )}

      {actionStatus.type === 'matter-error' && (
        <div role="alert" className="flex items-center gap-2 rounded border border-risk-high/40 bg-risk-high/10 px-4 py-3 text-sm text-risk-high">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{actionStatus.message}</span>
          <button
            className="ml-auto underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setActionStatus({ type: 'idle' })}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---- Left column: comparison + evidence ---- */}
        <div className="space-y-6 lg:col-span-2">
          {/* Mark comparison */}
          <Card title="Mark comparison">
            <div className="flex flex-col items-stretch gap-6 py-2 md:flex-row md:items-center md:justify-between">
              {/* Proposed / protected mark */}
              <div className="flex-1 text-center md:text-left">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-secondary">
                  Your protected mark
                </p>
                <p className="font-mono text-2xl font-black uppercase tracking-tighter text-forge-navy-950">
                  {proposedMark?.markText ?? '—'}
                </p>
                {proposedMark && (
                  <p className="mt-1 text-xs italic text-text-secondary">
                    Jurisdiction: {proposedMark.jurisdiction}
                    {proposedMark.niceClasses.length > 0 && (
                      <> &nbsp;|&nbsp; Classes: {proposedMark.niceClasses.join(', ')}</>
                    )}
                  </p>
                )}
              </div>

              {/* VS divider */}
              <div className="flex flex-row items-center gap-4 md:flex-col md:items-center">
                <div className="h-px flex-1 bg-forge-silver-300 md:h-8 md:w-px" aria-hidden="true" />
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-forge-silver-100 font-bold text-forge-navy-950"
                  aria-hidden="true"
                >
                  VS
                </div>
                <div className="h-px flex-1 bg-forge-silver-300 md:h-8 md:w-px" aria-hidden="true" />
              </div>

              {/* Candidate / conflicting mark */}
              <div className="flex-1 text-center md:text-right">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-secondary">
                  Candidate match
                </p>
                <div
                  className={cn('flex items-center justify-center gap-2 md:justify-end', rp?.colour)}
                  aria-label={`Conflicting candidate mark: ${result.candidateMarkText}`}
                >
                  {rp && <rp.Icon className="h-5 w-5 flex-shrink-0" aria-hidden={true} />}
                  <span className="font-mono text-2xl font-black uppercase tracking-tighter">
                    {result.candidateMarkText}
                  </span>
                </div>
                <p className="mt-1 text-xs italic text-text-secondary">
                  Source: {result.candidateSource}&nbsp;&nbsp;|&nbsp;&nbsp;Ref:{' '}
                  <span className="font-mono not-italic">{result.candidateRef}</span>
                </p>
                {result.jurisdiction && (
                  <p className="text-xs italic text-text-secondary">
                    Jurisdiction: {result.jurisdiction}
                    {result.niceClasses && result.niceClasses.length > 0 && (
                      <> &nbsp;|&nbsp; Classes: {result.niceClasses.join(', ')}</>
                    )}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Evidence panel */}
          <ConfusionRiskBreakdown score={score} />
        </div>

        {/* ---- Right column: summary + actions ---- */}
        <div className="space-y-6 lg:col-span-1">
          {/* Risk summary */}
          <Card title="Risk summary">
            <div className="py-4 text-center">
              <div
                className={cn(
                  'mx-auto mb-4 inline-flex h-24 w-24 items-center justify-center rounded-full border-8',
                  rp?.border,
                  rp?.colour,
                )}
                role="img"
                aria-label={`Risk level: ${rp?.label ?? 'unknown'}`}
              >
                {rp && <rp.Icon className="h-10 w-10" aria-hidden={true} />}
              </div>
              <RiskBadge rating={score.compositeRating} score={score.compositeScore} />
              <p className="mt-1 text-sm font-semibold text-text-primary">
                Likelihood of confusion
              </p>
              <p className="mt-2 px-2 text-sm text-text-secondary">
                {score.compositeRating === 'high' &&
                  'Strong phonetic, visual, and/or class evidence. Immediate review recommended.'}
                {score.compositeRating === 'medium' &&
                  'Moderate similarity across one or more dimensions. Attorney review advised.'}
                {score.compositeRating === 'low' &&
                  'Weak similarity indicators. Monitor for status changes.'}
              </p>
            </div>

            {/* Score bars */}
            <dl className="mt-2 space-y-2 border-t border-forge-silver-300 pt-4">
              {[
                { label: 'Phonetic', value: score.phoneticScore },
                { label: 'Visual', value: score.visualScore },
                {
                  label: 'Conceptual',
                  value: score.conceptualScore,
                  unavailable: score.conceptualScore === null,
                },
                {
                  label: 'Class overlap',
                  value: score.classOverlap ? 100 : 0,
                  binary: true,
                },
              ].map(({ label, value, unavailable, binary }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs font-semibold text-text-secondary">
                    <dt>{label}</dt>
                    <dd>
                      {unavailable ? (
                        <span className="italic text-text-secondary">Unavailable</span>
                      ) : binary ? (
                        <span className={value ? 'text-risk-high' : 'text-risk-low'}>
                          {value ? 'Yes' : 'No'}
                        </span>
                      ) : (
                        `${value}%`
                      )}
                    </dd>
                  </div>
                  {!unavailable && (
                    <div className="mt-1 h-1.5 w-full rounded-full bg-forge-silver-100">
                      <div
                        className={cn(
                          'h-1.5 rounded-full',
                          (value ?? 0) >= 70
                            ? 'bg-risk-high'
                            : (value ?? 0) >= 40
                              ? 'bg-risk-medium'
                              : 'bg-risk-low',
                        )}
                        style={{ width: `${value ?? 0}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </div>
              ))}
            </dl>

          </Card>

          {/* Action panel */}
          <Card title="Actions" className="bg-forge-navy-950 border-none text-white">
            <div className="space-y-3">
              {/* Export — all roles */}
              <PdfExport
                request={{
                  reportType: 'risk-detail',
                  context: {
                    screen: 'risk-detail',
                    resultId: result.id,
                    searchId: result.searchId,
                    candidateMarkText: result.candidateMarkText,
                    candidateRef: result.candidateRef,
                  },
                }}
                label="Export risk report"
                className="w-full [&>button]:w-full [&>button]:justify-center [&>div>a]:w-full [&>div>a]:justify-center"
              />

              {/* Admin + attorney only actions */}
              {canActOnResult && (
                <>
                  <Button
                    variant="outline"
                    className="w-full border-white/30 text-white hover:bg-white/10"
                    onClick={() => setMatterModalOpen(true)}
                    disabled={actionStatus.type === 'saving-matter'}
                    aria-label="Save to matter"
                  >
                    <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                    Save to matter
                    <span className="ml-auto text-xs opacity-60">(mock)</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full border-white/30 text-white hover:bg-white/10"
                    onClick={() => navigate('/office-actions')}
                    aria-label="Research Office Actions"
                  >
                    <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                    Research Office Actions
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full border-risk-high/60 text-risk-high hover:bg-risk-high/10"
                    onClick={() => setDiscardModalOpen(true)}
                    aria-label="Discard result"
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Discard result
                  </Button>
                </>
              )}

              {/* Viewer-only notice */}
              {!canActOnResult && (
                <p className="text-xs text-forge-subtext-onDark">
                  Save, research, and discard actions require the Attorney or Admin role.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ---- Modals ---- */}
      {matterSaveRequest && (
        <MatterSelectionModal
          isOpen={matterModalOpen}
          onClose={() => setMatterModalOpen(false)}
          saveRequest={matterSaveRequest}
          onSaved={handleMatterSaved}
        />
      )}

      <DiscardConfirmModal
        isOpen={discardModalOpen}
        candidateMarkText={result.candidateMarkText}
        onConfirm={handleDiscard}
        onClose={() => setDiscardModalOpen(false)}
      />
    </div>
  );
};
