import type { ReactNode } from 'react';
import { FeatureUnavailable } from '../../app/FeatureUnavailable';
import { useRuntimeCapabilities, type RuntimeCapabilities } from './runtimeCapabilities';

type FeatureName = keyof RuntimeCapabilities['features'];

interface RuntimeFeatureBoundaryProps {
  feature: FeatureName;
  children: ReactNode;
  blockedTitle: string;
  blockedDetail: string;
  disabledTitle?: string;
  disabledDetail?: string;
  allowDegraded?: boolean;
}

export function RuntimeFeatureBoundary({
  feature,
  children,
  blockedTitle,
  blockedDetail,
  disabledTitle = blockedTitle,
  disabledDetail = blockedDetail,
  allowDegraded = false,
}: RuntimeFeatureBoundaryProps) {
  const runtime = useRuntimeCapabilities();

  if (runtime.isLoading) {
    return <div className="p-8 text-center text-text-secondary" role="status">Checking feature availability…</div>;
  }

  const capability = runtime.data?.features[feature];
  const status = capability?.status;
  if (status === 'available' || (allowDegraded && status === 'degraded')) return <>{children}</>;

  if (status === 'disabled') {
    return <FeatureUnavailable title={disabledTitle} detail={disabledDetail} />;
  }

  // If capability state cannot be resolved, fail closed rather than rendering a
  // mutation/data-dependent surface that will predictably fail at runtime.
  return <FeatureUnavailable title={blockedTitle} detail={blockedDetail} />;
}
