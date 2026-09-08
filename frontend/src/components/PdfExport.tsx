import React, { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle, Download, FileDown, LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../lib/utils';
import { features } from '../config/features';
import { hasCapability } from '../features/auth/capabilities';
import { useAuthStore } from '../features/auth/authStore';
import {
  type CreateExportInput,
  type ExportStatus,
  mapExportFailureCode,
  pollExportAndDownload,
} from '../features/reports/reportsApi';

export type PdfReportRequest =
  | {
      reportType: 'search-results';
      context: {
        searchId: string;
      };
    }
  | {
      reportType: 'risk-detail';
      context: {
        searchId: string;
        resultId: string;
      };
    }
  | {
      reportType: 'portfolio-summary';
      context: {
        portfolioMarkId: string;
        includeWatches?: boolean;
        includeAlerts?: boolean;
      };
    };

interface PdfExportProps {
  request: PdfReportRequest;
  disabled?: boolean;
  className?: string;
  label?: string;
}

type ExportUiState =
  | { status: 'idle' }
  | { status: 'loading'; jobStatus?: ExportStatus | 'creating' }
  | { status: 'pending_status'; exportId: string; message: string }
  | { status: 'success'; downloadUrl: string; fileName: string }
  | { status: 'error'; message: string; isPollingFailure?: boolean };

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pdf:${crypto.randomUUID()}`;
  }
  return `pdf:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildCreateExportInput(request: PdfReportRequest, idempotencyKey: string): CreateExportInput {
  if (request.reportType === 'search-results') {
    return {
      type: 'search_results',
      sourceEntityId: request.context.searchId,
      idempotencyKey,
      parameters: {},
    };
  }
  if (request.reportType === 'risk-detail') {
    return {
      type: 'risk_report',
      sourceEntityId: request.context.searchId,
      idempotencyKey,
      parameters: { resultId: request.context.resultId },
    };
  }
  return {
    type: 'portfolio_summary',
    sourceEntityId: request.context.portfolioMarkId,
    idempotencyKey,
    parameters: {
      ...(request.context.includeWatches !== undefined ? { includeWatches: request.context.includeWatches } : {}),
      ...(request.context.includeAlerts !== undefined ? { includeAlerts: request.context.includeAlerts } : {}),
    },
  };
}

export const PdfExport: React.FC<PdfExportProps> = ({
  request,
  disabled = false,
  className,
  label = 'Export PDF',
}) => {
  const user = useAuthStore((state) => state.user);
  const canExport = features.pdfExportEnabled && hasCapability(user?.role, 'reports:export');

  const [state, setState] = useState<ExportUiState>({ status: 'idle' });
  const statusId = useId();
  const objectUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Idempotency and export identity tracking for 3 retry cases
  const idempotencyKeyRef = useRef<string | null>(null);
  const exportIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  if (!canExport) return null;

  const startExport = async (isRegeneration = false) => {
    if (disabled || state.status === 'loading') return;

    if (request.reportType === 'search-results' && !request.context.searchId) return;
    if (request.reportType === 'risk-detail' && (!request.context.searchId || !request.context.resultId)) return;
    if (request.reportType === 'portfolio-summary' && !request.context.portfolioMarkId) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;

    // Case C: Regenerate -> NEW idempotency key, reset exportId
    if (isRegeneration || !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
      exportIdRef.current = null;
    }

    // Cancel existing in-flight polling if any
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({ status: 'loading', jobStatus: exportIdRef.current ? 'processing' : 'creating' });

    try {
      const exportInput = buildCreateExportInput(request, idempotencyKeyRef.current);
      const result = await pollExportAndDownload(exportInput, {
        exportId: exportIdRef.current ?? undefined,
        signal: controller.signal,
        onExportCreated: (newId) => {
          exportIdRef.current = newId;
        },
        onProgress: (jobStatus) => {
          if (!controller.signal.aborted) {
            setState((current) => current.status === 'loading' ? { ...current, jobStatus } : current);
          }
        },
      });

      if (controller.signal.aborted) return;

      const downloadUrl = URL.createObjectURL(result.blob);
      objectUrlRef.current = downloadUrl;
      setState({
        status: 'success',
        downloadUrl,
        fileName: result.fileName,
      });
    } catch (error) {
      if (controller.signal.aborted) return;

      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'TIMEOUT') {
        // Section 19: Client polling timeout -> Keep exportId, allow Check status again (Case B)
        setState({
          status: 'pending_status',
          exportId: exportIdRef.current ?? '',
          message: 'The report is still being prepared.',
        });
        return;
      }

      const serverCode = error && typeof error === 'object' && 'serverCode' in error ? String((error as { serverCode: unknown }).serverCode) : null;
      const message = mapExportFailureCode(serverCode || (error instanceof Error ? error.message : null));

      setState({
        status: 'error',
        message,
        isPollingFailure: Boolean(exportIdRef.current),
      });
    }
  };

  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {state.status === 'success' ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={state.downloadUrl}
            download={state.fileName}
            className="inline-flex items-center justify-center rounded bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Download PDF
          </a>
          <Button variant="ghost" size="sm" onClick={() => void startExport(true)} aria-label="Generate a new PDF">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Regenerate
          </Button>
        </div>
      ) : state.status === 'pending_status' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void startExport(false)}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Check status again
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void startExport(false)}
          disabled={disabled || state.status === 'loading'}
          aria-describedby={disabled ? statusId : undefined}
        >
          {state.status === 'loading' ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : state.status === 'error' ? (
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {state.status === 'loading' ? 'Generating PDF…' : state.status === 'error' ? 'Retry export' : label}
        </Button>
      )}

      <div id={statusId} className="text-xs text-text-secondary" aria-live="polite">
        {disabled && state.status === 'idle' && 'PDF export becomes available when this screen has report data.'}
        {state.status === 'loading' && (
          state.jobStatus === 'processing' ? 'Generating report pages…' : 'Queued PDF export job…'
        )}
        {state.status === 'pending_status' && (
          <span className="text-text-secondary">{state.message}</span>
        )}
        {state.status === 'success' && (
          <span className="inline-flex items-center gap-1 text-forge-teal-700">
            <CheckCircle className="h-3 w-3" aria-hidden="true" />
            PDF ready: {state.fileName}
          </span>
        )}
        {state.status === 'error' && <span role="alert" className="text-risk-high">{state.message}</span>}
      </div>
    </div>
  );
};
