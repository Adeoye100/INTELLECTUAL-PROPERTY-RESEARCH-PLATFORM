import { useEffect, useState } from 'react';
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
  };
}

interface MembershipCapabilityEnvelope {
  runtimeCapabilities?: RuntimeCapabilities;
}

export const loadRuntimeCapabilities = () =>
  getApiClient().requestJson<MembershipCapabilityEnvelope>('/me')
    .then((response) => response.runtimeCapabilities ?? null);

export function useRuntimeCapabilities() {
  const [data, setData] = useState<RuntimeCapabilities | null | undefined>(undefined);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    loadRuntimeCapabilities()
      .then((next) => {
        if (!active) return;
        setData(next);
        setIsError(false);
      })
      .catch(() => {
        if (!active) return;
        setData(null);
        setIsError(true);
      });
    return () => { active = false; };
  }, []);

  return { data, isLoading: data === undefined && !isError, isError };
}
