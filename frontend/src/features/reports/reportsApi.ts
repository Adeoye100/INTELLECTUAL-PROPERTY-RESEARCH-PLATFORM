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

export async function generatePdfReport(request: PdfReportRequest): Promise<PdfDownload> {
  const response = await getApiClient().requestBlob('/reports/pdf', {
    method: 'POST',
    body: request,
    headers: { Accept: 'application/pdf' },
    timeoutMs: 30_000,
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
      `${request.reportType}.pdf`,
    ),
    mocked: response.headers.get('x-mock-response') === 'true',
  };
}
