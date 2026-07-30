import { ChevronDownIcon } from 'lucide-react';
interface HeroSectionProps {
  animated?: boolean;
}
export function HeroSection({ animated = true }: HeroSectionProps) {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <p className="font-mono text-xs md:text-sm tracking-[0.32em] text-forge-silver-400 uppercase">
        Brand Protection, Forged
      </p>
      <h1 className="mt-5 max-w-3xl text-4xl md:text-6xl font-semibold text-forge-text-onDark leading-tight">
        Forge Global — Brand Protection and Intellectual Property Security
      </h1>
      <p className="mt-6 max-w-xl text-base md:text-lg text-forge-subtext-onDark">
        One shield, six capabilities. Search, analyze, and protect trademarks across
        every registry that matters — assembled into a single system of record.
      </p>
      <div
        className={`mt-16 flex flex-col items-center gap-2 text-forge-silver-400 ${
        animated ? 'animate-bounce-slow' : ''}`
        }>
        
        <span className="text-xs uppercase tracking-widest">Scroll to assemble</span>
        <ChevronDownIcon className="w-5 h-5" aria-hidden="true" />
      </div>
    </section>);
}