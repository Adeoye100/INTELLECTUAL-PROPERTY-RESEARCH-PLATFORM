import { FACETS } from '../../../data/facets';
import { LandingHeader } from '../LandingHeader';
import { StatSection } from '../StatSection';
import { CTASection } from '../CTASection';
import { HeroSection } from '../HeroSection';

interface StaticExperienceProps {
  logoAvailable?: boolean;
  showShield?: boolean;
}
// prefers-reduced-motion tier — a fully static page. The shield renders once,
// fully assembled, with no motion, no scroll listeners, and no 3D at all.
// Same six-facet content as the animated tiers, in plain document flow.
export function StaticExperience({ logoAvailable = true, showShield = true }: StaticExperienceProps) {
  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-forge-gradient text-forge-text-onDark"
    >
      <LandingHeader logoAvailable={logoAvailable} />
      <main>
        <HeroSection animated={false} showShield={showShield} />
        {FACETS.map((facet) =>
        <section
          key={facet.id}
          className="max-w-2xl mx-auto px-6 py-14 border-t border-forge-silver-800/20">
          
            <span className="font-mono text-sm tracking-widest text-forge-silver-400">
              {String(facet.index + 1).padStart(2, '0')} / 06
            </span>
            <h2 className="mt-3 text-2xl md:text-3xl font-semibold text-forge-text-onDark">
              {facet.title}
            </h2>
            <p className="mt-3 text-base text-forge-subtext-onDark leading-relaxed">
              {facet.description}
            </p>
          </section>
        )}
        <StatSection />
        <CTASection />
      </main>
    </div>);
}
