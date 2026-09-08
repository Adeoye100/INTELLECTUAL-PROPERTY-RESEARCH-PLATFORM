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
  firmId: string;
  requestedByUserId: string;
  type: ExportType;
  status: ExportStatus;
  sourceEntityId: string;
  requestId: string;
  idempotencyKey: string;
  parameters: Record<string, unknown>;
  storageKey: string | null;
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
  mocked: boolean;
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

export async function createExport(input: CreateExportInput): Promise<ExportDto> {
  return getApiClient().requestJson<ExportDto>('/exports', { method: 'POST', body: input });
}

export async function getExportStatus(exportId: string): Promise<ExportDto> {
  return getApiClient().requestJson<ExportDto>(`/exports/${exportId}`);
}

export async function downloadExportPdf(exportId: string, fallbackFileName = `export-${exportId}.pdf`): Promise<PdfDownload> {
  const response = await getApiClient().requestBlob(`/exports/${exportId}/download`, {
    headers: { Accept: 'application/pdf' },
    timeoutMs: 60_000,
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
    mocked: response.headers.get('x-mock-response') === 'true',
  };
}

export async function pollExportAndDownload(
  input: CreateExportInput,
  onProgress?: (status: ExportStatus) => void,
): Promise<PdfDownload> {
  const created = await createExport(input);
  let record = created;
  onProgress?.(record.status);

  const maxAttempts = 30;
  let attempt = 0;

  while (record.status === 'queued' || record.status === 'processing') {
    if (attempt >= maxAttempts) {
      throw new ApiError({
        code: 'TIMEOUT',
        message: 'PDF export generation timed out. Please retry later.',
        status: 408,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempt += 1;
    record = await getExportStatus(created.id);
    onProgress?.(record.status);
  }

  if (record.status === 'failed') {
    throw new ApiError({
      code: 'SERVER_ERROR',
      serverCode: record.failureCode || 'EXPORT_FAILED',
      message: `PDF export failed (${record.failureCode || 'UNKNOWN_ERROR'}).`,
      status: 500,
    });
  }

  return downloadExportPdf(record.id, `${record.type}-${record.id}.pdf`);
}
