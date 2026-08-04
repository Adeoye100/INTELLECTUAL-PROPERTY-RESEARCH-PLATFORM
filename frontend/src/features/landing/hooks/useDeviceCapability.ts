import { useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export type ExperienceTier = 'full' | 'lite' | 'static';

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

function detectLowPower(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as NavigatorWithMemory;

  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const lowCores =
  typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const smallViewport = window.matchMedia?.('(max-width: 767px)').matches ?? false;

  let hasWebGL: boolean;
  try {
    const canvas = document.createElement('canvas');
    hasWebGL = !!(
    canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));

  } catch {
    hasWebGL = false;
  }

  if (!hasWebGL) return true;
  if (lowMemory) return true;
  // Treat small-viewport touch devices with modest CPU as low power.
  if (coarsePointer && smallViewport && lowCores) return true;

  return false;
}

// Decides which shield experience to render:
// - 'static': prefers-reduced-motion — no 3D, no scroll-driven motion at all.
// - 'lite': low-power/mobile — 2D CSS scroll-reveal, no WebGL.
// - 'full': capable desktop — the Three.js / React Three Fiber scene.
export function useDeviceCapability(): ExperienceTier {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [lowPower] = useState(detectLowPower);

  if (prefersReducedMotion) return 'static';
  if (lowPower) return 'lite';
  return 'full';
}
