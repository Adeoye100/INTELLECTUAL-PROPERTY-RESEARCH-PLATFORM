import React, { useMemo } from 'react';
import { FACETS } from '../../../data/facets';
import { useScrollAssembly } from '../../../hooks/useScrollAssembly';
import { LandingHeader } from '../LandingHeader';
import { HeroSection } from '../HeroSection';
import { FacetSection } from '../FacetSection';
import { StatSection } from '../StatSection';
import { CTASection } from '../CTASection';

interface FullExperienceProps {
  logoAvailable?: boolean;
  showShield?: boolean;
}

// Capable devices retain the scroll-led content treatment, but the visual mark
// is intentionally a complete in-flow SVG. A fixed, partially assembled 3D
// scene put pieces over hero copy during startup and on compact viewports.
export function FullExperience({ logoAvailable = true, showShield = true }: FullExperienceProps) {
  const sectionRefs = useMemo(
    () => FACETS.map(() => React.createRef<HTMLElement>()),
    []
  );
  const { activeFacetIndex } = useScrollAssembly(sectionRefs);

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
