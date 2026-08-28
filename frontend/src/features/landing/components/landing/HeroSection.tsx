import { ChevronDownIcon } from 'lucide-react';
import { ShieldStatic } from './ShieldStatic';

interface HeroSectionProps {
  animated?: boolean;
  showShield?: boolean;
}

export function HeroSection({ animated = true, showShield = true }: HeroSectionProps) {
  return (
    <section
      data-testid="landing-hero"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-12 pt-28 text-center md:px-10"
    >
      <div className="flex flex-col items-center gap-8 md:gap-12">
        {showShield ? (
          <ShieldStatic
            size={220}
            animated={animated}
            className="h-auto max-w-full w-[min(56vw,220px)] shrink-0 sm:w-[min(45vw,280px)] md:w-[320px]"
          />
        ) : (
          <div className="h-24 sm:h-32 md:h-40" aria-hidden="true" />
        )}

        <div className="flex flex-col items-center">
          <p className="font-mono text-[10px] tracking-[0.32em] text-forge-silver-400 uppercase sm:text-xs md:text-sm">
            Brand Protection, Forged
          </p>

          <h1 className="mt-5 max-w-4xl font-heading text-3xl font-normal leading-[1.15] text-forge-text-onDark sm:text-4xl md:text-6xl lg:text-7xl">
            Forge Global — Brand Protection and Intellectual Property Security
          </h1>

          <div className="relative mt-8 max-w-xl">
            <div
              className="absolute inset-0 -inset-x-6 -inset-y-4 rounded-xl bg-[rgba(10,20,40,0.78)] backdrop-blur-sm sm:-inset-x-8"
              aria-hidden="true"
            />
            <p className="relative z-10 text-[clamp(0.95rem,2.5vw,1.125rem)] leading-[1.6] text-[#F7FAFC]">
              One shield, six capabilities. Search, analyze, and protect trademarks across
              every registry that matters — assembled into a single system of record.
            </p>
          </div>
        </div>
      </div>

      <div
        className={`mt-12 flex flex-col items-center gap-2 text-forge-silver-400 ${
          animated ? 'animate-bounce-slow' : ''
        }`}
      >
        <span className="text-[10px] uppercase tracking-widest sm:text-xs">Scroll to assemble</span>
        <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />
      </div>
    </section>
  );
}
