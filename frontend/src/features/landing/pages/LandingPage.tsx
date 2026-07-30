import { useEffect } from 'react';
import { useDeviceCapability } from '../hooks/useDeviceCapability';
import { FullExperience } from '../components/landing/experiences/FullExperience';
import { LiteExperience } from '../components/landing/experiences/LiteExperience';
import { StaticExperience } from '../components/landing/experiences/StaticExperience';

// Public, unauthenticated marketing route at "/" — the front door to Forge
// Global, before login. Picks one of three experiences based on motion
// preference and device capability; see hooks/useDeviceCapability.
export function LandingPage() {
  const tier = useDeviceCapability();

  useEffect(() => {
    document.title = 'Forge Global — Brand Protection and Intellectual Property Security';
  }, []);

  if (tier === 'static') return <StaticExperience />;
  if (tier === 'lite') return <LiteExperience />;
  return <FullExperience />;
}