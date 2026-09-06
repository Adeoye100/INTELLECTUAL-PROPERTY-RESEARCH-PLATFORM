import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  SearchIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ShieldStatic } from "./ShieldStatic";

interface HeroSectionProps {
  animated?: boolean;
  showShield?: boolean;
}

export function HeroSection({
  animated = true,
  showShield = true,
}: HeroSectionProps) {
  return (
    <section
      data-testid="landing-hero"
      className="relative flex min-h-screen flex-col overflow-hidden bg-[color:var(--landing-hero)] px-6 pb-16 pt-32 text-[color:var(--landing-hero-foreground)] md:px-10 md:pt-36"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--landing-hero)_0%,color-mix(in_srgb,var(--landing-hero)_94%,transparent)_52%,color-mix(in_srgb,var(--landing-hero-deep)_82%,transparent)_100%),url('/landingpagebg.webp')] bg-cover bg-center opacity-80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_28%,rgb(159_194_212_/_18%),transparent_25rem)]"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-forge-silver-100 sm:text-xs">
            <CheckCircle2Icon
              className="h-4 w-4 text-forge-subtext-onDark"
              aria-hidden="true"
            />
            Evidence-backed IP research
          </div>

          <h1 className="mt-7 max-w-4xl font-heading text-[clamp(3.4rem,8vw,7.5rem)] font-semibold leading-[0.82] tracking-[-0.055em] text-white">
            Clear the noise.
            <span className="mt-2 block text-forge-subtext-onDark">
              Protect what you build.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-7 text-[#F7FAFC] sm:text-lg sm:leading-8">
            Search registries, analyze risk, track office actions,
            and monitor portfolios from one workspace built for IP teams.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/auth/create-organization"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-forge-navy transition hover:-translate-y-0.5 hover:bg-forge-teal-100"
            >
              Start your workspace
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#capabilities"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-white/45 hover:bg-white/10"
            >
              Explore features
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/12 pt-5 text-xs text-white/65">
            {/*<span>Multi-jurisdiction search</span>*/}
            {/*<span>Explainable risk signals</span>*/}
            {/*<span>Firm-scoped security</span>*/}
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-[560px] items-center justify-center lg:justify-end">
          <div
            className="absolute inset-8 rounded-full bg-forge-subtext-onDark/15 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative w-full rounded-[2rem] border border-white/15 bg-[color:var(--landing-hero-deep)]/72 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="font-subheading text-sm tracking-[0.18em] text-forge-silver-300">
                  Research overview
                </p>
                <p className="mt-1 text-xs text-white/55">
                  One query. Complete evidence.
                </p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
                <SearchIcon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>

            <div className="grid items-center gap-6 py-6 sm:grid-cols-[1fr_1.1fr]">
              {showShield ? (
                <ShieldStatic
                  size={220}
                  animated={animated}
                  className="mx-auto h-auto w-[min(48vw,220px)] max-w-full shrink-0"
                />
              ) : (
                <div className="h-48" aria-hidden="true" />
              )}
              <div className="space-y-3">
                {["Registry search", "Risk analysis", "Portfolio watch"].map(
                  (label, index) => (
                    <div
                      key={label}
                      className="border-l-2 border-forge-subtext-onDark/60 bg-white/6 px-4 py-3"
                    >
                      <span className="block text-[9px] uppercase tracking-[0.2em] text-white/45">
                        Signal 0{index + 1}
                      </span>
                      <span className="mt-1 block text-sm text-white">
                        {label}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-center">
              <div className="bg-white/6 px-3 py-3">
                <p className="font-subheading text-2xl tracking-wide text-white">
                  6
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">
                  Core tools
                </p>
              </div>
              <div className="bg-white/6 px-3 py-3">
                <p className="font-subheading text-2xl tracking-wide text-white">
                  1
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">
                  Single platform
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`relative z-10 mx-auto mt-8 flex flex-col items-center gap-1 text-white/50 ${
          animated ? "animate-bounce-slow" : ""
        }`}
      >
        {/*<span className="text-[10px] uppercase tracking-widest sm:text-xs">*/}
        {/*  Scroll to assemble*/}
        {/*</span>*/}
        <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
      </div>
    </section>
  );
}
