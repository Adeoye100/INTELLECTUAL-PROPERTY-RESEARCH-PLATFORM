import { useEffect } from 'react';
import { useDeviceCapability } from '../hooks/useDeviceCapability';
import { type LandingBootDependencies, useLandingBootGate } from '../hooks/useLandingBootGate';
import { LandingBootLoader } from '../components/landing/LandingBootLoader';
import { FullExperience } from '../components/landing/experiences/FullExperience';
import { LiteExperience } from '../components/landing/experiences/LiteExperience';
import { StaticExperience } from '../components/landing/experiences/StaticExperience';

// Public, unauthenticated marketing route at "/" — the front door to Forge
// Global, before login. Picks one of three experiences based on motion
// preference and device capability; see hooks/useDeviceCapability.
export function LandingPage(bootDependencies: LandingBootDependencies = {}) {
  const tier = useDeviceCapability();
  const bootState = useLandingBootGate(bootDependencies);

  useEffect(() => {
    document.title = 'Forge Global — Brand Protection and Intellectual Property Security';
  }, []);

  if (bootState === 'loading') return <LandingBootLoader />;

  const logoAvailable = bootState === 'ready';
  // The shield is an inline SVG and remains safe to render when raster preloading fails.
  const showShield = true;

  return tier === 'static'
    ? <StaticExperience logoAvailable={logoAvailable} showShield={showShield} />
    : tier === 'lite'
      ? <LiteExperience logoAvailable={logoAvailable} showShield={showShield} />
      : <FullExperience logoAvailable={logoAvailable} showShield={showShield} />;
}
