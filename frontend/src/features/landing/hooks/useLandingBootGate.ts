import { useEffect, useState } from 'react';

export type LandingBootState = 'loading' | 'ready' | 'fallback';

export interface LandingBootDependencies {
  fontReady?: () => Promise<unknown>;
  preloadImages?: () => Promise<void>;
  timeoutMs?: number;
}

export const LANDING_BOOT_TIMEOUT_MS = 5_000;

function decodeImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
      void decoded.then(() => resolve(), reject);
    };
    image.onerror = () => reject(new Error(`Could not load landing asset: ${src}`));
    image.src = src;
  });
}

export function preloadCriticalLandingImages(): Promise<void> {
  // The hero chrome is CSS and the shield is inline SVG, so they are ready as
  // soon as this component renders. The raster logo is the only critical image
  // that requires fetch/decode before the public landing page is revealed.
  return Promise.all(['/logo.png'].map(decodeImage)).then(() => undefined);
}

function waitForFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return document.fonts.ready;
}

/**
 * A landing-only gate. It never delays callback or authenticated routes,
 * releases immediately on success, and has a bounded clean fallback.
 */
export function useLandingBootGate({
  fontReady = waitForFonts,
  preloadImages = preloadCriticalLandingImages,
  timeoutMs = LANDING_BOOT_TIMEOUT_MS,
}: LandingBootDependencies = {}): LandingBootState {
  const [state, setState] = useState<LandingBootState>('loading');

  useEffect(() => {
    let mounted = true;
    let settled = false;
    const settle = (nextState: LandingBootState) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (mounted) setState(nextState);
    };
    const timeout = window.setTimeout(() => settle('fallback'), timeoutMs);

    void Promise.all([fontReady(), preloadImages()]).then(
      () => settle('ready'),
      () => settle('fallback'),
    );

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
    };
  }, [fontReady, preloadImages, timeoutMs]);

  return state;
}
