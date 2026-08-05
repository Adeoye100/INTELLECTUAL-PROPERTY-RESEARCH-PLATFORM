import { ApiError, getApiClient } from '../../lib/api/client';
import type { PdfReportRequest } from '../../components/PdfExport';

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

export const fileNameFromContentDisposition = (disposition: string | null, fallback: string) => {
  if (!disposition) return fallback;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeFileName(encoded.trim());
  return disposition.match(/filename="?([^";]+)"?/i)?.[1]?.trim() || fallback;
};

export async function generatePdfReport(request: PdfReportRequest): Promise<PdfDownload> {
  const response = await getApiClient().requestBlob('/reports/pdf', { method: 'POST', body: request, timeoutMs: 30_000 });
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
      `${request.reportType}.pdf`,
    ),
    mocked: response.headers.get('x-mock-response') === 'true',
  };
}
