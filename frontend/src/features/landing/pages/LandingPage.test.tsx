import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANDING_BOOT_TIMEOUT_MS } from '../hooks/useLandingBootGate';
import { LandingPage } from './LandingPage';

class IntersectionObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const resolvedAssets = () => Promise.resolve();
const resolvedFonts = () => Promise.resolve();

function renderLanding(props: Parameters<typeof LandingPage>[0] = {}) {
  return render(<MemoryRouter><LandingPage {...props} /></MemoryRouter>);
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LandingPage boot gate', () => {
  it('hides landing content while critical assets or fonts are pending', () => {
    const fontReady = vi.fn(() => new Promise<void>(() => undefined));
    const preloadImages = vi.fn(() => new Promise<void>(() => undefined));

    renderLanding({ fontReady, preloadImages });

    expect(screen.getByRole('status')).toHaveTextContent('Preparing Forge Global…');
    expect(screen.queryByTestId('landing-hero')).toBeNull();
    expect(preloadImages).toHaveBeenCalledOnce();
  });

  it('renders the complete landing experience as soon as fonts and assets resolve', async () => {
    let resolveFonts!: () => void;
    let resolveAssets!: () => void;
    renderLanding({
      fontReady: () => new Promise<void>((resolve) => { resolveFonts = resolve; }),
      preloadImages: () => new Promise<void>((resolve) => { resolveAssets = resolve; }),
    });

    await act(async () => { resolveFonts(); });
    expect(screen.queryByTestId('landing-hero')).toBeNull();
    await act(async () => { resolveAssets(); });

    expect(await screen.findByTestId('landing-hero')).toBeVisible();
  });

  it('releases a clean fallback exactly at the five-second maximum', async () => {
    vi.useFakeTimers();
    renderLanding({
      fontReady: () => new Promise<void>(() => undefined),
      preloadImages: () => new Promise<void>(() => undefined),
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(LANDING_BOOT_TIMEOUT_MS - 1); });
    expect(screen.queryByTestId('landing-hero')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(screen.getByTestId('landing-hero')).toBeVisible();
    expect(screen.queryByText('Preparing Forge Global…')).toBeNull();
  });

  it('uses the stable fallback without a broken logo when image decoding fails', async () => {
    renderLanding({
      fontReady: resolvedFonts,
      preloadImages: () => Promise.reject(new Error('decode failed')),
    });

    expect(await screen.findByTestId('landing-hero')).toBeVisible();
    expect(screen.queryByAltText('Forge Global logo')).toBeNull();
    expect(screen.getByRole('img', { name: /shield mark, assembled from six facets/i })).toBeVisible();
  });

  it('only renders a complete in-flow shield and has no page-level horizontal overflow class gap', async () => {
    const { container } = renderLanding({ fontReady: resolvedFonts, preloadImages: resolvedAssets });

    const hero = await screen.findByTestId('landing-hero');
    const shield = screen.getByRole('img', { name: /shield mark, assembled from six facets/i });
    expect(hero).toContainElement(shield);
    expect(shield.closest('.fixed')).toBeNull();
    expect(container.firstElementChild).toHaveClass('overflow-x-clip');
    expect(shield.querySelectorAll('path[opacity="0.3"]')).toHaveLength(0);
  });

  it('uses the static, non-animated path for reduced-motion users', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
    renderLanding({ fontReady: resolvedFonts, preloadImages: resolvedAssets });

    const hero = await screen.findByTestId('landing-hero');
    expect(hero).toBeVisible();
    expect(hero.querySelector('.animate-bounce-slow')).toBeNull();
  });

  it('cleans up its timeout when unmounted', async () => {
    vi.useFakeTimers();
    const { unmount } = renderLanding({
      fontReady: () => new Promise<void>(() => undefined),
      preloadImages: () => new Promise<void>(() => undefined),
    });
    unmount();

    await act(async () => { await vi.advanceTimersByTimeAsync(LANDING_BOOT_TIMEOUT_MS); });
    expect(screen.queryByText('Preparing Forge Global…')).toBeNull();
  });
});

describe('LandingPage responsive structure', () => {
  it('keeps the mobile hero shield and copy in normal flow at 390px without overlap', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    renderLanding({ fontReady: resolvedFonts, preloadImages: resolvedAssets });

    const hero = await screen.findByTestId('landing-hero');
    expect(hero).toHaveClass('flex', 'flex-col', 'px-6');
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(hero.querySelector('.fixed')).toBeNull();
  });
});
