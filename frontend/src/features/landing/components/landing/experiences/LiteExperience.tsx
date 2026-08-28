import React, { useMemo } from 'react';
import { FACETS } from '../../../data/facets';
import { useFacetReveal } from '../../../hooks/useFacetReveal';
import { LandingHeader } from '../LandingHeader';
import { HeroSection } from '../HeroSection';
import { FacetSection } from '../FacetSection';
import { StatSection } from '../StatSection';
import { CTASection } from '../CTASection';

// Low-power / mobile fallback — a pure CSS + SVG scroll-reveal of the same
// shield and content, with no WebGL. Facets lock in via IntersectionObserver
// rather than continuous scroll math, keeping this tier cheap to run.
interface LiteExperienceProps {
  logoAvailable?: boolean;
  showShield?: boolean;
}

export function LiteExperience({ logoAvailable = true, showShield = true }: LiteExperienceProps) {
  const sectionRefs = useMemo(
    () => FACETS.map(() => React.createRef<HTMLElement>()),
    []
  );
  const { activeFacetIndex } = useFacetReveal(sectionRefs);

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-forge-gradient text-forge-text-onDark"
    >
      <LandingHeader logoAvailable={logoAvailable} />

      <main className="relative z-10">
        <HeroSection showShield={showShield} />
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
    </div>);

}
