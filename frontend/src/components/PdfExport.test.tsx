import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfExport, type PdfReportRequest } from './PdfExport';
import { useAuthStore } from '../features/auth/authStore';

const searchRequest: PdfReportRequest = {
  reportType: 'search-results',
  context: {
    searchId: '11111111-1111-4111-8111-111111111111',
  },
};

const createResponse = () => new Response(
  JSON.stringify({
    id: '44444444-4444-4444-8444-444444444444',
    firmId: '11111111-1111-4111-8111-111111111111',
    requestedByUserId: '33333333-3333-4333-8333-333333333333',
    type: 'search_results',
    status: 'completed',
    sourceEntityId: '11111111-1111-4111-8111-111111111111',
    requestId: 'req-1',
    idempotencyKey: 'search-11111111-1111-4111-8111-111111111111',
    parameters: {},
    storageKey: 'exports/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.pdf',
    mimeType: 'application/pdf',
    byteSize: 20,
    checksumSha256: 'a'.repeat(64),
    failureCode: null,
    queuedAt: '2026-08-22T00:00:00.000Z',
    processingStartedAt: '2026-08-22T00:00:00.000Z',
    completedAt: '2026-08-22T00:00:01.000Z',
    failedAt: null,
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:01.000Z',
  }),
  {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  },
);

const downloadResponse = () => new Response(
  '%PDF-1.4\nfixture\n%%EOF',
  {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="forge-search.pdf"',
    },
  },
);

beforeEach(() => {
  const NativeURL = URL;
  class TestURL extends NativeURL {}
  TestURL.createObjectURL = vi.fn().mockReturnValue('blob:https://frontend.test/report');
  TestURL.revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', TestURL);
  useAuthStore.setState({ token: 'authenticated-token' });
});

afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PdfExport', () => {
  it('is keyboard operable, triggers async export job creation and download, then exposes a download link', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createResponse())
      .mockResolvedValueOnce(downloadResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} label="Export results PDF" />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Export results PDF' })).toHaveFocus();
    await user.keyboard('{Enter}');

    const download = await screen.findByRole('link', { name: 'Download PDF' });
    expect(download).toHaveAttribute('href', 'blob:https://frontend.test/report');
    expect(download).toHaveAttribute('download', 'forge-search.pdf');
    expect(screen.getByText(/PDF ready: forge-search.pdf/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/exports', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        type: 'search_results',
        sourceEntityId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: 'search-11111111-1111-4111-8111-111111111111',
        parameters: {},
      }),
    }));
  });

  it('disables generation while loading', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }))
      .mockResolvedValue(downloadResponse()));
    render(<PdfExport request={searchRequest} />);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(screen.getByRole('button', { name: 'Generating PDF…' })).toBeDisabled();

    resolveRequest?.(createResponse());
    expect(await screen.findByRole('link', { name: 'Download PDF' })).toBeVisible();
  });

  it('shows a failure and retries successfully', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Export creation failed.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(createResponse())
      .mockResolvedValueOnce(downloadResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} />);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is temporarily unavailable. Please try again.');

    await user.click(screen.getByRole('button', { name: 'Retry export' }));
    expect(await screen.findByRole('link', { name: 'Download PDF' })).toBeVisible();
  });

  it('does not call the endpoint while disabled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} disabled />);

    const button = screen.getByRole('button', { name: 'Export PDF' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/becomes available when this screen has report data/i)).toBeVisible();
    await user.click(button);
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
