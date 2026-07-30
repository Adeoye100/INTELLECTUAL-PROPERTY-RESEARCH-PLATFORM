import { type Facet } from '../../data/facets';
interface FacetInfoCardProps {
  facet: Facet | null;
}
export function FacetInfoCard({ facet }: FacetInfoCardProps) {
  return (
    <div
      aria-live="polite"
      aria-hidden={facet ? undefined : true}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 z-20 max-w-sm rounded-xl border border-forge-silver-700/40 bg-forge-navy/85 backdrop-blur-md px-5 py-4 shadow-xl transition-all duration-300 ${
      facet ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`
      }>
      
      {facet &&
      <>
          <p className="text-xs font-mono tracking-widest text-forge-silver-300">
            FACET {String(facet.index + 1).padStart(2, '0')}
          </p>
          <h3 className="mt-1 text-base font-semibold text-forge-text-onDark">
            {facet.title}
          </h3>
          <p className="mt-1 text-sm text-forge-subtext-onDark">{facet.description}</p>
        </>
      }
    </div>);
}