import { CheckIcon } from 'lucide-react';
import { BRAND_PROTECTION_SERVICES } from '../../data/brandProtection';

function cardTone(index: number) {
  if (index === 1) return "bg-primary text-primary-foreground border-primary";
  if (index === 2)
    return "bg-[color:var(--landing-hero)] text-white border-[color:var(--landing-hero)]";
  return "bg-card text-card-foreground border-border";
}

export function CapabilitiesSection() {
  return (
    <section
      id="capabilities"
      className="scroll-mt-20 bg-[color:var(--landing-surface)] px-6 py-24 md:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-8 border-b border-border pb-12 lg:grid-cols-[1fr_0.82fr] lg:items-end">
          <div>
            <p className="font-subheading text-sm tracking-[0.22em] text-primary">
              End-to-end brand protection
            </p>
            <h2 className="mt-4 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-7xl">
              From intelligence to enforcement support to prevention.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            We find infringers, establish what they are doing, prepare
            verifiable evidence, support the appropriate authorities, and put
            practical controls in place to reduce repeat attacks.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {BRAND_PROTECTION_SERVICES.map((service, index) => {
            const Icon = service.icon;
            const isStrong = index === 1 || index === 2;

            return (
              <article
                key={service.id}
                id={service.id}
                className={`group relative flex min-h-[390px] scroll-mt-28 flex-col overflow-hidden rounded-[1.25rem] border p-7 transition duration-300 hover:-translate-y-1 ${cardTone(index)}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-full border ${isStrong ? "border-white/25 bg-white/10" : "border-border bg-secondary"}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span
                    className={`font-subheading text-sm tracking-[0.18em] ${isStrong ? "text-current/65" : "text-muted-foreground"}`}
                  >
                    0{index + 1}
                  </span>
                </div>
                <div className="mt-auto pt-12">
                  <h3 className="font-subheading text-3xl tracking-[0.02em]">
                    {service.title}
                  </h3>
                  <p
                    className={`mt-4 text-sm leading-6 ${isStrong ? "text-current/78" : "text-muted-foreground"}`}
                  >
                    {service.summary}
                  </p>
                  <ul className={`mt-5 space-y-2 text-xs leading-5 ${isStrong ? 'text-current/78' : 'text-muted-foreground'}`}>
                    {service.outcomes.map((outcome) => (
                      <li key={outcome} className="flex gap-2">
                        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{outcome}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  aria-hidden="true"
                  className={`absolute -bottom-16 -right-16 h-40 w-40 rounded-full border transition-transform duration-500 group-hover:scale-110 ${isStrong ? "border-white/12" : "border-primary/15"}`}
                />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
