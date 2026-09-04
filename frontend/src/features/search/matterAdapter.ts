import { getApiClient } from '../../lib/api/client';
import type { Matter, MatterAdapter, MatterSaveRequest, MatterSaveResult } from '../../types';

interface MattersListResponse {
  items: Matter[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface SaveRiskResultResponse {
  matter: Matter;
  savedResult: unknown;
}

export const matterAdapter: MatterAdapter = {
  async listMatters(): Promise<Matter[]> {
    try {
      const response = await getApiClient().requestJson<MattersListResponse>('/matters');
      return response.items;
    } catch {
      return [];
    }
  },

  async saveToMatter(request: MatterSaveRequest): Promise<MatterSaveResult> {
    let created = false;
    let matterId = request.matterId;

    if (!matterId) {
      if (!request.newMatterName?.trim()) {
        throw new Error('A matter name is required when creating a new matter.');
      }
      const newMatter = await getApiClient().requestJson<Matter>('/matters', {
        method: 'POST',
        body: {
          name: request.newMatterName.trim(),
          clientRef: request.newMatterClientRef?.trim() ?? '',
        },
      });
      matterId = newMatter.id;
      created = true;
    }

    const saved = await getApiClient().requestJson<SaveRiskResultResponse>(`/matters/${encodeURIComponent(matterId)}/risk-results`, {
      method: 'POST',
      body: {
        resultId: request.resultId,
        candidateMarkText: request.candidateMarkText,
        riskScoreSnapshot: request.riskScoreSnapshot,
      },
    });

    return {
      matter: saved.matter,
      created,
      mocked: true,
    };
  },
};
