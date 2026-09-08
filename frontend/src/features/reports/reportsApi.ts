import { ApiError, getApiClient } from '../../lib/api/client';

export type ExportType = 'search_results' | 'risk_report' | 'portfolio_summary';
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface CreateExportInput {
  type: ExportType;
  sourceEntityId: string;
  idempotencyKey: string;
  parameters?: Record<string, unknown>;
}

export interface ExportDto {
  id: string;
  type: ExportType;
  status: ExportStatus;
  sourceEntityId: string;
  requestId: string;
  parameters: Record<string, unknown>;
  mimeType: string | null;
  byteSize: number | null;
  checksumSha256: string | null;
  failureCode: string | null;
  queuedAt: string;
  processingStartedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PdfDownload {
  blob: Blob;
  fileName: string;
}

const decodeFileName = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const sanitizePdfFileName = (value: string, fallback: string) => {
  const withoutControlCharacters = [...value]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('');
  const leafName = withoutControlCharacters.split(/[\\/]/).pop()?.trim();
  if (!leafName) return fallback;
  return leafName.toLowerCase().endsWith('.pdf') ? leafName : `${leafName}.pdf`;
};

export const fileNameFromContentDisposition = (disposition: string | null, fallback: string) => {
  if (!disposition) return fallback;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return sanitizePdfFileName(decodeFileName(encoded.trim()), fallback);
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
  return fileName ? sanitizePdfFileName(fileName, fallback) : fallback;
};

export function mapExportFailureCode(code?: string | null): string {
  switch (code) {
    case 'EXPORT_SOURCE_NOT_FOUND':
      return 'The report source is no longer available.';
    case 'EXPORT_SOURCE_UNAVAILABLE':
      return 'Report source data is temporarily unavailable.';
    case 'EXPORT_QUEUE_UNAVAILABLE':
      return 'Report generation is temporarily unavailable.';
    case 'EXPORT_RENDER_LIMIT_EXCEEDED':
      return 'The report is larger than the supported PDF limit.';
    case 'EXPORT_NOT_READY':
      return 'The report is still being prepared.';
    case 'EXPORT_DOWNLOAD_UNAVAILABLE':
      return 'The PDF is temporarily unavailable for download.';
    default:
      return 'PDF generation could not be completed.';
  }
}

export async function createExport(input: CreateExportInput, signal?: AbortSignal): Promise<ExportDto> {
  return getApiClient().requestJson<ExportDto>('/exports', { method: 'POST', body: input, signal });
}

export async function getExportStatus(exportId: string, signal?: AbortSignal): Promise<ExportDto> {
  return getApiClient().requestJson<ExportDto>(`/exports/${exportId}`, { signal });
}

export async function downloadExportPdf(
  exportId: string,
  fallbackFileName = `export-${exportId}.pdf`,
  signal?: AbortSignal,
): Promise<PdfDownload> {
  const response = await getApiClient().requestBlob(`/exports/${exportId}/download`, {
    headers: { Accept: 'application/pdf' },
    timeoutMs: 60_000,
    signal,
  });
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/pdf') {
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: 'The report service returned a file that is not a PDF.',
      status: response.status,
      requestId: response.headers.get('x-request-id') ?? undefined,
    });
  }
  if (response.blob.size === 0) {
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: 'The report service returned an empty PDF.',
      status: response.status,
    });
  }
  return {
    blob: response.blob,
    fileName: fileNameFromContentDisposition(
      response.headers.get('content-disposition'),
      fallbackFileName,
    ),
  };
}

export interface PollExportOptions {
  exportId?: string;
  signal?: AbortSignal;
  onProgress?: (status: ExportStatus) => void;
  onExportCreated?: (exportId: string) => void;
}

export async function pollExportAndDownload(
  input: CreateExportInput,
  options: PollExportOptions = {},
): Promise<PdfDownload> {
  const { exportId: existingExportId, signal, onProgress, onExportCreated } = options;

  let record: ExportDto;

  if (existingExportId) {
    record = await getExportStatus(existingExportId, signal);
  } else {
    record = await createExport(input, signal);
    onExportCreated?.(record.id);
  }

  onProgress?.(record.status);

  const maxAttempts = 30;
  let attempt = 0;

  while (record.status === 'queued' || record.status === 'processing') {
    if (signal?.aborted) {
      throw new ApiError({
        code: 'ABORTED',
        message: 'The request was cancelled.',
      });
    }
    if (attempt >= maxAttempts) {
      throw new ApiError({
        code: 'TIMEOUT',
        serverCode: 'EXPORT_NOT_READY',
        message: 'The report is still being prepared.',
        status: 408,
      });
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new ApiError({ code: 'ABORTED', message: 'The request was cancelled.' }));
        }, { once: true });
      }
    });
    if (signal?.aborted) {
      throw new ApiError({
        code: 'ABORTED',
        message: 'The request was cancelled.',
      });
    }
    attempt += 1;
    record = await getExportStatus(record.id, signal);
    onProgress?.(record.status);
  }

  if (record.status === 'failed') {
    throw new ApiError({
      code: 'SERVER_ERROR',
      serverCode: record.failureCode || 'EXPORT_FAILED',
      message: mapExportFailureCode(record.failureCode),
      status: 500,
    });
  }

  return downloadExportPdf(record.id, `${record.type}-${record.id}.pdf`, signal);
}
