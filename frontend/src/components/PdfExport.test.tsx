import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfExport, type PdfReportRequest } from './PdfExport';
import { useAuthStore } from '../features/auth/authStore';

const searchRequest: PdfReportRequest = {
  reportType: 'search-results',
  context: {
    screen: 'search-results',
    query: 'FORGE',
    jurisdictions: ['US', 'EU'],
    niceClasses: '9, 42',
    resultIds: ['1', '2'],
  },
};

const successResponse = () => new Response(
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
  it('is keyboard operable, sends report type and screen context, then exposes a download', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} label="Export results PDF" />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Export results PDF' })).toHaveFocus();
    await user.keyboard('{Enter}');

    const download = await screen.findByRole('link', { name: 'Download PDF' });
    expect(download).toHaveAttribute('href', 'blob:https://frontend.test/report');
    expect(download).toHaveAttribute('download', 'forge-search.pdf');
    expect(screen.getByText(/PDF ready: forge-search.pdf/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/reports/pdf', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(searchRequest),
    }));
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer authenticated-token');
  });

  it('disables generation while loading', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
    render(<PdfExport request={searchRequest} />);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(screen.getByRole('button', { name: 'Generating PDF…' })).toBeDisabled();
    expect(screen.getByText('Preparing your report for download.')).toBeVisible();

    resolveRequest?.(successResponse());
    expect(await screen.findByRole('link', { name: 'Download PDF' })).toBeVisible();
  });

  it('shows a failure and retries successfully', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'The report service could not generate this PDF.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} />);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate/i);

    await user.click(screen.getByRole('button', { name: 'Retry export' }));
    expect(await screen.findByRole('link', { name: 'Download PDF' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a successful response whose content type is not PDF', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>not a report</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })));
    render(<PdfExport request={searchRequest} />);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a PDF/i);
    expect(screen.getByRole('button', { name: 'Retry export' })).toBeVisible();
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
