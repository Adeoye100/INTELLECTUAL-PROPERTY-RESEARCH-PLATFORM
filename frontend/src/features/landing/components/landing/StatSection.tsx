import { type ReactNode } from 'react';
import { STATS } from '../../data/facets';

interface StatSectionProps {
  shieldVisual?: ReactNode;
}

export function StatSection({ shieldVisual }: StatSectionProps) {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 py-24 text-center">
      {shieldVisual}
      <h2
        className={`${shieldVisual ? 'mt-10' : ''} text-2xl md:text-3xl font-semibold text-forge-text-onDark max-w-2xl`}>
        
        One assembled shield. Every registry, every jurisdiction, one system of record.
      </h2>
      <dl className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-10 max-w-3xl w-full">
        {STATS.map((stat) =>
        <div key={stat.label} className="flex flex-col items-center">
            <dt className="text-xs uppercase tracking-widest text-forge-silver-400">
              {stat.label}
            </dt>
            <dd className="mt-2 font-mono text-4xl md:text-5xl font-semibold text-forge-text-onDark">
              {stat.value}
            </dd>
            <p className="mt-2 text-sm text-forge-subtext-onDark">{stat.caption}</p>
          </div>
        )}
      </dl>
    </section>);

}