import React, { useEffect, useId, useState } from 'react';
import { CheckCircle, Download, FileDown, LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../lib/utils';
import { generatePdfReport } from '../features/reports/reportsApi';

export type PdfReportRequest =
  | {
      reportType: 'search-results';
      context: {
        screen: 'search-results';
        query: string;
        jurisdictions: string[];
        niceClasses: string;
        status?: string;
        owner?: string;
        filedFrom?: string;
        filedTo?: string;
        resultIds: string[];
      };
    }
  | {
      reportType: 'risk-detail';
      context: {
        screen: 'risk-detail';
        resultId: string;
        searchId: string;
        candidateMarkText: string;
        candidateRef: string;
      };
    }
  | {
      reportType: 'portfolio-summary';
      context: {
        screen: 'portfolio';
        markIds: string[];
        firmId?: string;
      };
    };

interface PdfExportProps {
  request: PdfReportRequest;
  disabled?: boolean;
  className?: string;
  label?: string;
}

type ExportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; downloadUrl: string; fileName: string; objectUrl: boolean; mocked: boolean }
  | { status: 'error'; message: string };

export const PdfExport: React.FC<PdfExportProps> = ({
  request,
  disabled = false,
  className,
  label = 'Export PDF',
}) => {
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const statusId = useId();

  useEffect(() => {
    return () => {
      if (state.status === 'success' && state.objectUrl) {
        URL.revokeObjectURL(state.downloadUrl);
      }
    };
  }, [state]);

  const generate = async () => {
    if (disabled || state.status === 'loading') return;
    if (state.status === 'success' && state.objectUrl) URL.revokeObjectURL(state.downloadUrl);
    setState({ status: 'loading' });

    try {
      const result = await generatePdfReport(request);
      const downloadUrl = URL.createObjectURL(result.blob);
      setState({
        status: 'success',
        downloadUrl,
        fileName: result.fileName,
        objectUrl: true,
        mocked: result.mocked,
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'PDF generation failed. Please try again.',
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
          <Button variant="ghost" size="sm" onClick={generate} aria-label="Generate a new PDF">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Regenerate
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={generate}
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
        {state.status === 'loading' && 'Preparing your report for download.'}
        {state.status === 'success' && !state.mocked && (
          <span className="inline-flex items-center gap-1 text-forge-teal-700">
            <CheckCircle className="h-3 w-3" aria-hidden="true" />
            PDF ready: {state.fileName}
          </span>
        )}
        {state.status === 'success' && state.mocked && (
          <span className="inline-flex items-start gap-1 text-risk-medium">
            <CheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
            Development fixture ready. Real PDF generation and authorization remain backend-blocked.
          </span>
        )}
        {state.status === 'error' && <span role="alert" className="text-risk-high">{state.message}</span>}
      </div>
    </div>
  );
};
