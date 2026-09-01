import { type ReactNode } from "react";
import { STATS } from "../../data/facets";

interface StatSectionProps {
  shieldVisual?: ReactNode;
}

export function StatSection({ shieldVisual }: StatSectionProps) {
  return (
    <section
      id="proof"
      className="scroll-mt-20 bg-[color:var(--landing-hero)] px-6 py-24 text-white md:px-10 lg:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            {shieldVisual}
            <p className="font-subheading text-sm tracking-[0.22em] text-forge-subtext-onDark">
              A platform with structure
            </p>
            <h2 className="mt-4 max-w-2xl text-5xl font-semibold leading-[0.95] tracking-[-0.035em] sm:text-6xl">
              One clear system around the work that protects a brand.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-white/68 lg:justify-self-end">
            Forge Global brings the research lifecycle together while retaining
            evidence, organization boundaries, and role-aware access at every
            step.
          </p>
        </div>

        <dl className="mt-14 grid border-y border-white/15 sm:grid-cols-3">
          {STATS.map((stat, index) => (
            <div
              key={stat.label}
              className={`flex min-h-[190px] flex-col justify-between py-7 sm:px-7 ${index > 0 ? "border-t border-white/15 sm:border-l sm:border-t-0" : ""}`}
            >
              <dt className="text-[10px] uppercase tracking-[0.2em] text-white/55">
                {stat.label}
              </dt>
              <div className="mt-8">
                <dd className="font-subheading text-6xl tracking-wide text-white md:text-7xl">
                  {stat.value}
                </dd>
                <p className="mt-2 text-sm text-forge-subtext-onDark">
                  {stat.caption}
                </p>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
