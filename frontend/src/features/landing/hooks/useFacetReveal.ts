import { type RefObject, useEffect, useState } from 'react';

export interface FacetReveal {
  revealed: boolean[];
  activeFacetIndex: number;
}

// Lightweight IntersectionObserver-based reveal for the low-power/mobile tier —
// avoids continuous scroll math, just flips each facet to "revealed" once its
// section is meaningfully in view.
export function useFacetReveal(sectionRefs: RefObject<HTMLElement | null>[]): FacetReveal {
  const [revealed, setRevealed] = useState<boolean[]>(() => sectionRefs.map(() => false));

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sectionRefs.forEach((ref: RefObject<HTMLElement | null>, i: number) => {
      const el = ref.current;
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting) {
            setRevealed((prev) => {
              if (prev[i]) return prev;
              const next = [...prev];
              next[i] = true;
              return next;
            });
          }
        },
        { threshold: 0.4 }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [sectionRefs]);

  let activeFacetIndex = -1;
  revealed.forEach((r, i) => {
    if (r) activeFacetIndex = i;
  });

  return { revealed, activeFacetIndex };
}
