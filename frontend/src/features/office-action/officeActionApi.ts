import { getApiClient } from '../../lib/api/client';
import type { OfficeActionRef, OfficeActionSearchResponse, OfficeActionSearchResult } from '../../types';

export interface OfficeActionSearchRequest {
  markText?: string;
  applicationNumber?: string;
  owner?: string;
  jurisdiction?: string;
  documentType?: string;
  filedFrom?: string;
  filedTo?: string;
}

export const searchOfficeActions = (filters: OfficeActionSearchRequest) => {
  const params = new URLSearchParams();
  if (filters.markText) params.set('markText', filters.markText.trim());
  if (filters.applicationNumber) params.set('applicationNumber', filters.applicationNumber.trim());
  if (filters.owner) params.set('owner', filters.owner.trim());
  if (filters.jurisdiction) params.set('jurisdiction', filters.jurisdiction.trim());
  if (filters.documentType) params.set('documentType', filters.documentType.trim());
  if (filters.filedFrom) params.set('filedFrom', filters.filedFrom.trim());
  if (filters.filedTo) params.set('filedTo', filters.filedTo.trim());
  return getApiClient().requestJson<OfficeActionSearchResponse>(`/office-actions/search?${params}`);
};

export const createOfficeActionRef = (portfolioMarkId: string, item: OfficeActionSearchResult) => {
  return getApiClient().requestJson<OfficeActionRef>(`/portfolio-marks/${encodeURIComponent(portfolioMarkId)}/office-action-refs`, {
    method: 'POST',
    body: {
      sourceRegistry: item.sourceRegistry,
      sourceReferenceId: item.sourceReferenceId,
      applicationNumber: item.applicationNumber || null,
      documentType: item.documentType,
      officeActionDate: item.officeActionDate || null,
      examinerName: item.examinerName || null,
      examinerReasoningSummary: item.examinerReasoningSummary || null,
      summaryMethod: item.summaryMethod,
      sourceDocumentUrl: item.sourceDocumentUrl || null,
      sourceMetadata: item.sourceMetadata || {},
    },
  });
};

export const linkOfficeActionToMatter = (matterId: string, officeActionRefId: string) => {
  return getApiClient().requestJson<{ id: string; matterId: string; officeActionRefId: string }>(`/matters/${encodeURIComponent(matterId)}/office-action-refs`, {
    method: 'POST',
    body: { officeActionRefId },
  });
};
