import { getApiClient } from '../../lib/api/client';
import type { PortfolioAttachment, PortfolioMark, PortfolioMarkDetail, WatchSummary, WatchUpsertRequest } from '../../types';

export interface CreatePortfolioMarkRequest {
  markText: string;
  jurisdiction: string;
  niceClasses: number[];
  renewalDate: string;
}

export interface AttachmentDownloadResponse {
  downloadUrl: string;
  fileName: string;
  mocked?: boolean;
}

export const listPortfolioMarks = () => getApiClient().requestJson<PortfolioMark[]>('/portfolio');

export const getPortfolioMark = (markId: string) =>
  getApiClient().requestJson<PortfolioMarkDetail>(`/portfolio/${encodeURIComponent(markId)}`);

export const createPortfolioMark = (request: CreatePortfolioMarkRequest) =>
  getApiClient().requestJson<PortfolioMark>('/portfolio', { method: 'POST', body: request });

export const importPortfolioMark = (searchResultId: string) =>
  getApiClient().requestJson<PortfolioMark>('/portfolio/import', { method: 'POST', body: { searchResultId } });

export const createPortfolioWatch = (
  markId: string,
  request: Omit<WatchUpsertRequest, 'portfolioMarkId'>,
) => getApiClient().requestJson<WatchSummary>(`/portfolio/${encodeURIComponent(markId)}/watch`, {
  method: 'POST',
  body: request,
});

export const listPortfolioAttachments = (markId: string) =>
  getApiClient().requestJson<PortfolioAttachment[]>(`/portfolio/${encodeURIComponent(markId)}/attachments`);

export const getPortfolioAttachmentDownload = (markId: string, attachmentId: string) =>
  getApiClient().requestJson<AttachmentDownloadResponse>(
    `/portfolio/${encodeURIComponent(markId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
  );
