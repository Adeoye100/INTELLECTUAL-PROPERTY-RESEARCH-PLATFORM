import { getApiClient } from '../../lib/api/client';
import type { OfficeActionRef } from '../../types';

export interface OfficeActionSearchRequest {
  markText: string;
  niceClass: string;
}

export interface OfficeActionLinkResponse {
  success: boolean;
  message: string;
  linkedOfficeActionId: string;
  linkedPortfolioMarkId: string;
}

export const searchOfficeActions = ({ markText, niceClass }: OfficeActionSearchRequest) => {
  const params = new URLSearchParams();
  if (markText) params.set('markText', markText);
  if (niceClass) params.set('niceClass', niceClass);
  return getApiClient().requestJson<OfficeActionRef[]>(`/office-actions/search?${params}`);
};

export const linkOfficeAction = (officeActionId: string, portfolioMarkId: string) =>
  getApiClient().requestJson<OfficeActionLinkResponse>('/office-actions/link', {
    method: 'POST',
    body: { officeActionId, portfolioMarkId },
  });
