import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../../lib/api/client';

export type RuntimeFeatureStatus = 'available' | 'degraded' | 'blocked' | 'disabled' | 'pending';
export type RuntimeWriteStatus = 'available' | 'blocked' | 'disabled';

export interface RuntimeCapabilities {
  mode: 'standard' | 'read-only-demo';
  readOnly: boolean;
  registries: {
    USPTO: {
      status: RuntimeFeatureStatus;
      recordCount: number | null;
      corpusComplete: boolean | null;
      dataThrough: string | null;
    };
    EUIPO: {
      status: RuntimeFeatureStatus;
      recordCount: number | null;
      corpusComplete: boolean | null;
      dataThrough: string | null;
    };
  };
  features: {
    search: { status: RuntimeFeatureStatus; mode: string | null };
    riskAnalysis: { status: RuntimeFeatureStatus };
    officeActions: { status: RuntimeFeatureStatus; reason: string | null };
    portfolio: { status: RuntimeFeatureStatus; writeStatus: RuntimeWriteStatus };
    watches: { status: RuntimeFeatureStatus; writeStatus: RuntimeWriteStatus; automationStatus: RuntimeFeatureStatus };
    reports: { status: RuntimeFeatureStatus };
    usersInvitations: { status: RuntimeFeatureStatus; writeStatus: RuntimeWriteStatus };
    billing: { status: RuntimeFeatureStatus };
  };
}

export const loadRuntimeCapabilities = () =>
  getApiClient().requestJson<RuntimeCapabilities>('/capabilities');

export function useRuntimeCapabilities() {
  return useQuery({
    queryKey: ['runtime-capabilities'],
    queryFn: loadRuntimeCapabilities,
    retry: false,
    staleTime: 30_000,
  });
}
