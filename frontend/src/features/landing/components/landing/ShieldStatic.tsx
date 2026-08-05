import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildFacetWedges,
  svgWedgePath,
  SHIELD_VIEWBOX } from
'./shieldGeometry';
import { FACETS } from '../../data/facets';

interface ShieldStaticProps {
  // 0-1 per facet, in facet order. Omit (or pass all 1s) for a fully assembled shield.
  facetProgress?: number[];
  size?: number;
  className?: string;
  // When false, renders a single static frame with no transitions/animations —
  // used for the prefers-reduced-motion tier.
  animated?: boolean;
  onFacetHover?: (index: number | null) => void;
  onFacetSelect?: (index: number | null) => void;
}

const WEDGES = buildFacetWedges();
const SCATTER = 34;

export function ShieldStatic({
  facetProgress,
  size = 340,
  className = '',
  animated = true,
  onFacetHover,
  onFacetSelect
}: ShieldStaticProps) {
  const uid = useId();
  const metalId = `shieldMetal-${uid}`;
  const flareId = `shieldFlare-${uid}`;
  const progress = useMemo(() => facetProgress ?? WEDGES.map(() => 1), [facetProgress]);
  const prevProgress = useRef<number[]>(WEDGES.map(() => 0));
  const [flareKeys, setFlareKeys] = useState<number[]>(WEDGES.map(() => 0));

  useEffect(() => {
    if (!animated) return;
    const completed: number[] = [];
    progress.forEach((p, i) => {
      if (p >= 0.999 && prevProgress.current[i] < 0.999) {
        completed.push(i);
      }
      prevProgress.current[i] = p;
    });
    if (completed.length) {
      setFlareKeys((current) => current.map((key, index) => completed.includes(index) ? key + 1 : key));
    }
  }, [animated, progress]);

  return (
    <svg
      viewBox={SHIELD_VIEWBOX}
      width={size}
      height={size * 1.2}
      className={className}
      role="img"
      aria-label="Forge Global shield mark, assembled from six facets representing the platform's core capabilities">
      
      <defs>
        <linearGradient id={metalId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EDEFF3" />
          <stop offset="35%" stopColor="#8B95A3" />
          <stop offset="55%" stopColor="#C2C9D2" />
          <stop offset="100%" stopColor="#3A4150" />
        </linearGradient>
        <radialGradient id={flareId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#EDEFF3" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#EDEFF3" stopOpacity="0" />
        </radialGradient>
      </defs>

      {WEDGES.map((wedge, i) => {
        const p = Math.min(1, Math.max(0, progress[i] ?? 0));
        const dx = wedge.outward.x * SCATTER * (1 - p);
        const dy = wedge.outward.y * SCATTER * (1 - p);
        const rotate = (1 - p) * (i % 2 === 0 ? 10 : -10);
        const opacity = 0.3 + 0.7 * p;
        const d = svgWedgePath(wedge);
        const interactive = Boolean(onFacetHover || onFacetSelect);

        return (
          <g key={wedge.index}>
            <path
              d={d}
              fill={`url(#${metalId})`}
              stroke="#0A1428"
              strokeWidth={1.2}
              opacity={opacity}
              style={{
                transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`,
                transformOrigin: `${wedge.centroid.x}px ${wedge.centroid.y}px`,
                transition: animated ?
                'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease-out' :
                'none',
                cursor: interactive ? 'pointer' : 'default',
                pointerEvents: interactive ? 'auto' : 'none'
              }}
              onMouseEnter={() => onFacetHover?.(wedge.index)}
              onMouseLeave={() => onFacetHover?.(null)}
              onFocus={() => onFacetHover?.(wedge.index)}
              onBlur={() => onFacetHover?.(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onFacetSelect?.(wedge.index);
                }
              }}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? 'button' : undefined}
              aria-label={interactive ? `Show ${FACETS[wedge.index]?.title ?? `facet ${wedge.index + 1}`}` : undefined}
              onClick={() => onFacetSelect?.(wedge.index)} />
            
            {animated &&
            <path
              key={`flare-${wedge.index}-${flareKeys[i]}`}
              d={d}
              fill={`url(#${flareId})`}
              className="shield-facet-flare"
              style={{
                transform: `translate(${dx}px, ${dy}px)`,
                transformOrigin: `${wedge.centroid.x}px ${wedge.centroid.y}px`,
                pointerEvents: 'none'
              }} />

            }
          </g>);

      })}
    </svg>);

}
