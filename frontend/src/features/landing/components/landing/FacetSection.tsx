import { forwardRef } from 'react';
import { type Facet } from '../../data/facets';

interface FacetSectionProps {
  facet: Facet;
  isActive: boolean;
}

export const FacetSection = forwardRef<HTMLElement, FacetSectionProps>(
  function FacetSection({ facet, isActive }, ref) {
    const isEven = facet.index % 2 === 0;

    return (
      <section
        ref={ref}
        className={`min-h-screen flex items-center px-6 md:px-16 py-24 justify-center ${
        isEven ? 'md:justify-start' : 'md:justify-end'}`
        }>
        
        <div
          className={`max-w-md transition-opacity duration-500 ${
          isActive ? 'opacity-100' : 'opacity-55'}`
          }>
          
          <span className="font-mono text-sm tracking-widest text-forge-silver-400">
            {String(facet.index + 1).padStart(2, '0')} / 06
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-semibold text-forge-text-onDark">
            {facet.title}
          </h2>
          <p className="mt-4 text-lg text-forge-subtext-onDark leading-relaxed">
            {facet.description}
          </p>
        </div>
      </section>);

  }
);