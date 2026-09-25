import { CheckCircle2Icon } from 'lucide-react';
import { INDUSTRIES } from '../../data/brandProtection';

const VALUES = [
  ['Integrity', 'Findings are lawfully obtained, documented, and capable of verification.'],
  ['Discretion', 'Client identity, strategy, matter information, and lawful sources are treated confidentially.'],
  ['Precision', 'We prioritise actionable intelligence and distinguish evidence from inference.'],
  ['Results', 'Work is directed toward disruption, enforceable action, and reduced repeat exposure.'],
] as const;

const REASONS = [
  'Field presence, not only desk research',
  'Evidence prepared for enforcement and regulatory review',
  'Investigation and preventive technology working together',
  'Strict confidentiality, safety controls, and ethical conduct',
  'Clear reporting and regular client updates',
] as const;

export function StatSection() {
  return (
    <>
      <section id="proof" className="scroll-mt-20 bg-[color:var(--landing-hero)] px-6 py-24 text-white md:px-10 lg:py-28">
        <div className="mx-auto max-w-[1240px]">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="font-subheading text-sm tracking-[0.22em] text-forge-subtext-onDark">Brand protection built on evidence</p>
              <h2 className="mt-4 max-w-2xl text-5xl font-semibold leading-[0.95] tracking-[-0.035em] sm:text-6xl">Field intelligence and technology, governed by clear standards.</h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-white/70 lg:justify-self-end">FORGEGUARD GLOBAL LIMITED helps companies defend products, trademarks, and intellectual property against counterfeiting and copying. Our secure client portal supports research, portfolio monitoring, evidence review, and controlled collaboration; it does not replace legal advice or public enforcement authority.</p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[1.25rem] border border-white/15 bg-white/15 md:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(([title, description]) => (
              <article key={title} className="min-h-56 bg-[color:var(--landing-hero)] p-7">
                <CheckCircle2Icon className="h-5 w-5 text-forge-subtext-onDark" aria-hidden="true" />
                <h3 className="mt-10 font-subheading text-2xl tracking-wide">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/65">{description}</p>
              </article>
            ))}
          </div>
          <div className="mt-14 grid gap-10 border-t border-white/15 pt-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="font-subheading text-sm tracking-[0.2em] text-forge-subtext-onDark">Mission and team</p>
              <p className="mt-4 max-w-xl text-lg leading-8 text-white/80">Our mission is to protect legitimate businesses and the consumers who trust them by exposing and disrupting counterfeiting operations through lawful evidence, capable people, and preventive systems.</p>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">Engagements draw on trained investigators, intellectual property specialists, technology practitioners, and relevant former law-enforcement experience according to the matter’s needs.</p>
            </div>
            <div>
              <p className="font-subheading text-sm tracking-[0.2em] text-forge-subtext-onDark">Why clients choose Forge Global</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {REASONS.map((reason) => <li key={reason} className="flex gap-3 border-t border-white/15 pt-3 text-sm leading-6 text-white/70"><CheckCircle2Icon className="mt-1 h-4 w-4 shrink-0 text-forge-subtext-onDark" aria-hidden="true" /><span>{reason}</span></li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>
      <section id="industries" className="bg-[color:var(--landing-surface)] px-6 py-20 md:px-10 lg:py-24">
        <div className="mx-auto max-w-[1240px]">
          <p className="font-subheading text-sm tracking-[0.22em] text-primary">Industries</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <h2 className="max-w-xl text-5xl font-semibold leading-[0.95] tracking-[-0.035em] text-foreground sm:text-6xl">Specialist protection where counterfeiting carries the greatest cost.</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {INDUSTRIES.map((industry, index) => (
                <div key={industry} className="flex min-h-20 items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 text-card-foreground">
                  <span className="font-subheading text-sm tracking-widest text-primary">0{index + 1}</span>
                  <span className="text-sm leading-6">{industry}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-6 text-muted-foreground">Counterfeits involving health, food, electrical, and industrial products may threaten public safety as well as revenue and reputation. Each matter is assessed according to its evidence, applicable rights, and competent jurisdiction.</p>
        </div>
      </section>
    </>
  );
}
