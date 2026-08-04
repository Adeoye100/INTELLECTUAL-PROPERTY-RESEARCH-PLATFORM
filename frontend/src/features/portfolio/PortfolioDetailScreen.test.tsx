import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioAttachment, PortfolioMarkDetail } from '../../types';
import { PortfolioDetailScreen } from './PortfolioDetailScreen';

const detail: PortfolioMarkDetail = { id: 'p1', firmId: 'f1', ownerUserId: 'u1', markText: 'FORGE GLOBAL', jurisdiction: 'US', niceClasses: [9], status: 'Registered', filingDate: '2020-01-01', renewalDate: '2030-01-01', sourceRegistry: 'USPTO', statusHistory: [{ id: 'h1', status: 'Registered', effectiveAt: '2021-01-01', source: 'USPTO' }] };
const attachment: PortfolioAttachment = { id: 'a1', portfolioMarkId: 'p1', fileName: 'certificate.pdf', contentType: 'application/pdf', uploadedAt: '2021-01-01', availability: 'available', mocked: true };

const renderDetail = (attachmentResponse: Response, downloadResponse?: Response) => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/portfolio/p1')) return new Response(JSON.stringify(detail), { status: 200 });
    if (url.endsWith('/attachments')) return attachmentResponse;
    if (url.endsWith('/download')) return downloadResponse ?? new Response('{}', { status: 503 });
    return new Response('{}', { status: 404 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/portfolio/p1']}><Routes><Route path="/portfolio/:markId" element={<PortfolioDetailScreen />} /></Routes></MemoryRouter></QueryClientProvider>);
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PortfolioDetailScreen attachments', () => {
  it('keeps mark details usable when attachments are unavailable', async () => {
    renderDetail(new Response('{}', { status: 503 }));
    expect(await screen.findByText('FORGE GLOBAL')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('Attachments unavailable');
    expect(screen.getByRole('table', { name: /Status history/ })).toBeVisible();
  });

  it('shows a failed-download retry state', async () => {
    renderDetail(new Response(JSON.stringify([attachment]), { status: 200 }), new Response('{}', { status: 503 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(await screen.findByRole('button', { name: 'Retry download' })).toBeVisible();
    expect(screen.getByText(/Download failed/)).toBeVisible();
  });
});
