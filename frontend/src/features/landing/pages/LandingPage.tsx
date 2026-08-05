import { lazy, Suspense, useEffect } from 'react';
import { useDeviceCapability } from '../hooks/useDeviceCapability';

const FullExperience = lazy(() => import('../components/landing/experiences/FullExperience').then((module) => ({ default: module.FullExperience })));
const LiteExperience = lazy(() => import('../components/landing/experiences/LiteExperience').then((module) => ({ default: module.LiteExperience })));
const StaticExperience = lazy(() => import('../components/landing/experiences/StaticExperience').then((module) => ({ default: module.StaticExperience })));

// Public, unauthenticated marketing route at "/" — the front door to Forge
// Global, before login. Picks one of three experiences based on motion
// preference and device capability; see hooks/useDeviceCapability.
export function LandingPage() {
  const tier = useDeviceCapability();

  useEffect(() => {
    document.title = 'Forge Global — Brand Protection and Intellectual Property Security';
  }, []);

  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-forge-navy-950 text-forge-subtext-onDark" role="status">Loading Forge Global…</main>}>
      {tier === 'static' ? <StaticExperience /> : tier === 'lite' ? <LiteExperience /> : <FullExperience />}
    </Suspense>
  );
}
