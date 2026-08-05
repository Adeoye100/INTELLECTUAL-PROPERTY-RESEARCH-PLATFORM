import React, { useMemo, useState } from 'react';
import { FACETS } from '../../../data/facets';
import { useFacetReveal } from '../../../hooks/useFacetReveal';
import { LandingHeader } from '../LandingHeader';
import { HeroSection } from '../HeroSection';
import { FacetSection } from '../FacetSection';
import { FacetInfoCard } from '../FacetInfoCard';
import { StatSection } from '../StatSection';
import { CTASection } from '../CTASection';
import { ShieldStatic } from '../ShieldStatic';

// Low-power / mobile fallback — a pure CSS + SVG scroll-reveal of the same
// shield and content, with no WebGL. Facets lock in via IntersectionObserver
// rather than continuous scroll math, keeping this tier cheap to run.
export function LiteExperience() {
  const sectionRefs = useMemo(
    () => FACETS.map(() => React.createRef<HTMLElement>()),
    []
  );
  const { revealed, activeFacetIndex } = useFacetReveal(sectionRefs);
  const [hoveredFacet, setHoveredFacet] = useState<number | null>(null);
  const [selectedFacet, setSelectedFacet] = useState<number | null>(null);

  const facetProgress = revealed.map((r) => r ? 1 : 0);
  const cardFacetIndex = hoveredFacet ?? selectedFacet;
  const cardFacet = cardFacetIndex !== null ? FACETS[cardFacetIndex] : null;

  return (
    <div
      className="relative min-h-screen text-forge-text-onDark overflow-hidden"
      style={{ backgroundImage: 'linear-gradient(rgba(10,20,40,0.38), rgba(10,20,40,0.38)), url(/landingpagebg.webp)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'scroll' }}
    >
      <div
        className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true">
        
        <div className="pointer-events-auto">
          <ShieldStatic
            facetProgress={facetProgress}
            size={260}
            onFacetHover={setHoveredFacet}
            onFacetSelect={setSelectedFacet} />
          
        </div>
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
        <StatSection shieldVisual={<ShieldStatic size={200} animated={false} />} />
        <CTASection />
      </main>

      <FacetInfoCard facet={cardFacet} />
    </div>);

}
