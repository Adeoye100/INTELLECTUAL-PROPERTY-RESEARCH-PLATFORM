import { getApiClient } from '../../lib/api/client';
import type { OfficeActionRef, OfficeActionSearchResponse, OfficeActionSearchResult } from '../../types';

export interface OfficeActionSearchRequest {
  markText: string;
  niceClass: string;
}

export const searchOfficeActions = ({ markText, niceClass }: OfficeActionSearchRequest) => {
  const params = new URLSearchParams();
  if (markText) params.set('markText', markText);
  if (niceClass) params.set('niceClass', niceClass);
  return getApiClient().requestJson<OfficeActionSearchResponse>(`/office-actions/search?${params}`);
};

export const createOfficeActionRef = (portfolioMarkId: string, item: OfficeActionSearchResult) => {
  const referenceText = item.sourceReferenceId || `${item.sourceRegistry} ${item.applicationNumber || ''}: ${item.markText}`;
  return getApiClient().requestJson<OfficeActionRef>(`/portfolio-marks/${encodeURIComponent(portfolioMarkId)}/office-action-refs`, {
    method: 'POST',
    body: {
      referenceText,
      examinerReasoningSummary: item.examinerReasoningSummary,
      linkedPrecedentRef: item.sourceReferenceId || null,
    },
  });
};

export const linkOfficeAction = (officeActionId: string, portfolioMarkId: string) =>
  createOfficeActionRef(portfolioMarkId, {
    sourceRegistry: 'USPTO',
    sourceReferenceId: officeActionId,
    applicationNumber: officeActionId,
    markText: '',
    owner: '',
    jurisdiction: 'US',
    documentType: 'Office Action',
    officeActionDate: new Date().toISOString().slice(0, 10),
    examinerName: '',
    examinerReasoningSummary: 'Linked precedent reference',
    summaryMethod: 'manual',
  });
