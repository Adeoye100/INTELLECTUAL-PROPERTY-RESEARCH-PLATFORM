import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Calendar, Download, FileText, RefreshCw } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { PortfolioAttachment, PortfolioDetailRouteState } from '../../types';
import { getRenewalWarning } from './portfolioDomain';
import {
  getPortfolioAttachmentDownload,
  getPortfolioMark,
  listPortfolioAttachments,
} from './portfolioApi';

type DownloadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; downloadUrl: string; fileName: string; mocked: boolean }
  | { status: 'error'; message: string };

export const PortfolioDetailScreen: React.FC = () => {
  const { markId = '' } = useParams<{ markId: string }>();
  const location = useLocation();
  const routeState = location.state as PortfolioDetailRouteState | null;
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const detail = useQuery({ queryKey: ['portfolio', 'detail', markId], queryFn: () => getPortfolioMark(markId), retry: false });
  const attachments = useQuery({ queryKey: ['portfolio', 'attachments', markId], queryFn: () => listPortfolioAttachments(markId), retry: false });
  const displayMark = detail.data ?? routeState?.mark;
  const returnTo = routeState?.returnTo ?? '/portfolio';

  const downloadAttachment = async (attachment: PortfolioAttachment) => {
    setDownloads((current) => ({ ...current, [attachment.id]: { status: 'loading' } }));
    try {
      const result = await getPortfolioAttachmentDownload(markId, attachment.id);
      setDownloads((current) => ({ ...current, [attachment.id]: { status: 'success', downloadUrl: result.downloadUrl, fileName: result.fileName, mocked: result.mocked === true } }));
    } catch (error) {
      setDownloads((current) => ({ ...current, [attachment.id]: { status: 'error', message: error instanceof Error ? error.message : 'Download failed.' } }));
    }
  };

  if (!displayMark && detail.isLoading) return <p className="p-8 text-center" role="status">Loading portfolio mark…</p>;
  if (!displayMark && detail.isError) return <section role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-8 text-center"><h1 className="text-xl font-bold">Mark detail unavailable</h1><Button className="mt-4" onClick={() => void detail.refetch()}>Retry mark detail</Button></section>;
  if (!displayMark) return <p>Portfolio mark not found.</p>;

  const renewal = getRenewalWarning(displayMark.renewalDate);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link to={returnTo} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-forge-teal-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to filtered portfolio</Link><h1 className="font-mono text-2xl font-black uppercase text-text-primary">{displayMark.markText}</h1><p className="text-sm text-text-secondary">{displayMark.jurisdiction} · Classes {displayMark.niceClasses.join(', ')} · {displayMark.sourceRegistry}</p></div>
        <Link to={`/watches?markId=${displayMark.id}`} state={{ mark: displayMark }} className="rounded bg-accent px-4 py-2 font-medium text-white focus-visible:ring-2 focus-visible:ring-accent">Configure watch</Link>
      </header>

      {detail.isLoading && <p role="status" className="rounded bg-forge-silver-100 p-3 text-sm">Refreshing status history while preserving {displayMark.markText} context…</p>}
      {detail.isError && <div role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-3"><p>Status history could not be refreshed.</p><Button className="mt-2" size="sm" onClick={() => void detail.refetch()}>Retry detail</Button></div>}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Mark details">
        <Card title="Current status"><Badge>{displayMark.status}</Badge><p className="mt-3 text-sm text-text-secondary">Filed {displayMark.filingDate}</p></Card>
        <Card title="Renewal"><p className="flex items-center gap-2 font-mono font-bold"><Calendar className="h-4 w-4" aria-hidden="true" />{displayMark.renewalDate}</p><Badge className="mt-3" risk={renewal.level}>{renewal.label}</Badge></Card>
        <Card title="Registry"><p className="font-bold">{displayMark.sourceRegistry}</p>{displayMark.mocked && <Badge className="mt-2" risk="medium">Mock data</Badge>}<p className="mt-2 text-sm text-text-secondary">Legal status remains subject to registry confirmation.</p></Card>
      </section>

      <Card title="Status history">
        {detail.data?.statusHistory.length ? <div className="overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Status history for {displayMark.markText}</caption><thead><tr className="border-b border-forge-silver-300">{['Effective date', 'Status', 'Source', 'Note'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">{heading}</th>)}</tr></thead><tbody>{detail.data.statusHistory.map((entry) => <tr key={entry.id} className="border-b border-forge-silver-100"><td className="px-3 py-3">{entry.effectiveAt}</td><th scope="row" className="px-3 py-3"><Badge>{entry.status}</Badge></th><td className="px-3 py-3">{entry.source}</td><td className="px-3 py-3 text-text-secondary">{entry.note ?? '—'}</td></tr>)}</tbody></table></div> : !detail.isLoading && !detail.isError && <p className="py-6 text-center text-text-secondary">No status history is available.</p>}
      </Card>

      <Card title="Attachments">
        {attachments.isLoading && <p role="status" className="flex items-center gap-2 text-text-secondary"><FileText className="h-4 w-4" aria-hidden="true" />Loading attachments…</p>}
        {attachments.isError && <div role="alert" className="rounded border border-risk-medium/40 bg-risk-medium/10 p-4"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 text-risk-medium" aria-hidden="true" /><div><p className="font-bold">Attachments unavailable</p><p className="text-sm text-text-secondary">The mark detail remains usable while document storage is unavailable.</p></div></div><Button variant="outline" size="sm" className="mt-3" onClick={() => void attachments.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry attachments</Button></div>}
        {attachments.data?.length === 0 && <p className="py-6 text-center text-text-secondary">No attachments have been added to this mark.</p>}
        {attachments.data && attachments.data.length > 0 && <ul className="divide-y divide-forge-silver-100">{attachments.data.map((attachment) => {
          const download = downloads[attachment.id] ?? { status: 'idle' as const };
          return <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold text-text-primary">{attachment.fileName}</p><p className="text-xs text-text-secondary">Uploaded {attachment.uploadedAt}{attachment.mocked ? ' · Mock attachment' : ''}</p></div><div>{attachment.availability === 'unavailable' ? <span className="text-sm font-bold text-risk-medium">File unavailable</span> : download.status === 'success' ? <div><a href={download.downloadUrl} download={download.fileName} className="inline-flex rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"><Download className="mr-2 h-4 w-4" aria-hidden="true" />Download file</a>{download.mocked && <p className="mt-1 text-xs text-risk-medium">Mock download; backend authorization is required.</p>}</div> : <div><Button variant="outline" size="sm" disabled={download.status === 'loading'} onClick={() => void downloadAttachment(attachment)}>{download.status === 'loading' ? 'Downloading…' : download.status === 'error' ? 'Retry download' : 'Download'}</Button>{download.status === 'error' && <p className="mt-1 max-w-xs text-xs text-risk-high" role="alert">{download.message}</p>}</div>}</div></li>;
        })}</ul>}
      </Card>
    </div>
  );
};
