import { FACETS } from '../../../data/facets';
import { LandingHeader } from '../LandingHeader';
import { StatSection } from '../StatSection';
import { CTASection } from '../CTASection';
import { ShieldStatic } from '../ShieldStatic';
// prefers-reduced-motion tier — a fully static page. The shield renders once,
// fully assembled, with no motion, no scroll listeners, and no 3D at all.
// Same six-facet content as the animated tiers, in plain document flow.
export function StaticExperience() {
  return (
    <div
      className="relative min-h-screen text-forge-text-onDark"
      style={{ backgroundImage: 'linear-gradient(rgba(10,20,40,0.38), rgba(10,20,40,0.38)), url(/landingpagebg.webp)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'scroll' }}
    >
      <LandingHeader />
      <main>
        <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 py-28">
          <ShieldStatic size={240} animated={false} />
          <p className="mt-8 font-mono text-xs md:text-sm tracking-[0.32em] text-forge-silver-400 uppercase">
            Brand Protection, Forged
          </p>
          <h1 className="mt-4 max-w-3xl font-heading text-4xl font-normal leading-tight text-forge-text-onDark md:text-6xl">
            Forge Global — Brand Protection and Intellectual Property Security
          </h1>
          <p className="mt-6 max-w-xl text-base md:text-lg text-forge-subtext-onDark">
            One shield, six capabilities. Search, analyze, and protect trademarks
            across every registry that matters — assembled into a single system of
            record.
          </p>
        </section>
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
        <StatSection shieldVisual={<ShieldStatic size={200} animated={false} />} />
        <CTASection />
      </main>
    </div>);
}
