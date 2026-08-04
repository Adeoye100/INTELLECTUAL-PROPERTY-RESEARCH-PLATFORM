import { type MutableRefObject, type RefObject, useEffect, useRef, useState } from 'react';

export interface ScrollAssembly {
  // Read every frame by the 3D scene — intentionally NOT React state, so
  // updates never trigger a re-render of the component tree.
  progressRef: MutableRefObject<number[]>;
  // Updated only when the active facet changes — cheap enough for the 2D overlay.
  activeFacetIndex: number;
}

// Drives the shield "assembly" from scroll position. Each facet section gets
// its own 0-1 progress: 0 while its section is still below the fold, 1 once
// the user has scrolled most of the way past it. Pass a STABLE array of refs
// (e.g. created once via useRef in the parent) — one per facet section, in order.
export function useScrollAssembly(
sectionRefs: RefObject<HTMLElement | null>[])
: ScrollAssembly {
  const progressRef = useRef<number[]>(new Array(sectionRefs.length).fill(0));
  const [activeFacetIndex, setActiveFacetIndex] = useState(-1);

  useEffect(() => {
    let frame = 0;
    let ticking = false;

    const compute = () => {
      const vh = window.innerHeight;
      const startLine = vh * 0.85;
      const endLine = vh * 0.2;
      const next = sectionRefs.map((ref: RefObject<HTMLElement | null>) => {
        const el = ref.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        const raw = (startLine - rect.top) / (startLine - endLine);
        return Math.min(1, Math.max(0, raw));
      });
      progressRef.current = next;

      let lastStarted = -1;
      for (let i = 0; i < next.length; i++) {
        if (next[i] > 0.001) lastStarted = i;
      }
      setActiveFacetIndex((prev) => prev === lastStarted ? prev : lastStarted);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        frame = requestAnimationFrame(compute);
      }
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sectionRefs]);

  return { progressRef, activeFacetIndex };
}
