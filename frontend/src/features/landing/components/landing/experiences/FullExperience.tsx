import React, { Suspense, useMemo, useState } from 'react';
import { FACETS } from '../../../data/facets';
import { useScrollAssembly } from '../../../hooks/useScrollAssembly';
import { LandingHeader } from '../LandingHeader';
import { HeroSection } from '../HeroSection';
import { FacetSection } from '../FacetSection';
import { FacetInfoCard } from '../FacetInfoCard';
import { StatSection } from '../StatSection';
import { CTASection } from '../CTASection';

const ShieldScene = React.lazy(() =>
import('../ShieldScene').then((m) => ({ default: m.ShieldScene }))
);

// The full, interactive 3D experience — a Three.js shield that assembles as
// the user scrolls through the six capability facets. Loaded only for
// capable, motion-enabled devices; the R3F/three.js chunk is code-split via
// React.lazy so it never touches the reduced-motion or low-power bundles.
export function FullExperience() {
  const sectionRefs = useMemo(
    () => FACETS.map(() => React.createRef<HTMLElement>()),
    []
  );
  const { progressRef, activeFacetIndex } = useScrollAssembly(sectionRefs);
  const [hoveredFacet, setHoveredFacet] = useState<number | null>(null);
  const [selectedFacet, setSelectedFacet] = useState<number | null>(null);

  const cardFacetIndex = hoveredFacet ?? selectedFacet;
  const cardFacet = cardFacetIndex !== null ? FACETS[cardFacetIndex] : null;

  return (
    <div className="relative min-h-screen bg-forge-teal text-forge-text-onDark overflow-hidden">
      <div className="fixed inset-0 z-0" aria-hidden="true">
        <Suspense fallback={null}>
          <ShieldScene
            progressRef={progressRef}
            onHover={setHoveredFacet}
            onSelect={setSelectedFacet} />
          
        </Suspense>
      </div>

      <LandingHeader />

      <main className="relative z-10">
        <HeroSection />
        {FACETS.map((facet, i) =>
        <FacetSection
          key={facet.id}
          ref={sectionRefs[i]}
          facet={facet}
          isActive={activeFacetIndex === i} />

        )}
        <StatSection />
        <CTASection />
      </main>

      <FacetInfoCard facet={cardFacet} />
    </div>);

}