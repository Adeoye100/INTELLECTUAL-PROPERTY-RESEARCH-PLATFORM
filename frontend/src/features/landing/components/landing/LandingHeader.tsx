import { ArrowUpRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

interface LandingHeaderProps {
  logoAvailable?: boolean;
}

export function LandingHeader({ logoAvailable = true }: LandingHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-[color:var(--landing-hero-deep)]/92 px-4 backdrop-blur-xl md:px-8">
      <div className="mx-auto flex h-[76px] max-w-[1400px] items-center justify-between gap-4">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-3"
          aria-label="Forge Global home"
        >
          {logoAvailable ? (
            <img
              src="/logo.png"
              alt="Forge Global logo"
              className="h-10 w-10 shrink-0 object-contain md:h-12 md:w-12"
            />
          ) : (
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 md:h-12 md:w-12"
            />
          )}
          <span className="min-w-0">
            <span className="block truncate font-subheading text-xl tracking-[0.12em] text-white md:text-2xl">
              Forge Global
            </span>
            <span className="hidden text-[9px] uppercase tracking-[0.24em] text-forge-silver-300 sm:block">
              Intellectual property intelligence
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          <a
            className="text-xs uppercase tracking-[0.16em] text-white/75 transition hover:text-white"
            href="#capabilities"
          >
            Capabilities
          </a>
          <a
            className="text-xs uppercase tracking-[0.16em] text-white/75 transition hover:text-white"
            href="#workflow"
          >
            How it works
          </a>
          <a
            className="text-xs uppercase tracking-[0.16em] text-white/75 transition hover:text-white"
            href="#proof"
          >
            Platform
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            to="/auth/login"
            className="hidden whitespace-nowrap text-xs font-medium text-white transition-colors hover:text-forge-silver-200 sm:inline-flex md:text-sm"
          >
            Sign in
          </Link>
          <ThemeToggle />
          <Link
            to="/auth/create-organization"
            className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs font-semibold text-forge-navy transition hover:bg-forge-teal-100 sm:px-5 sm:text-sm"
          >
            <span className="hidden min-[440px]:inline">
              Create organization
            </span>
            <span className="min-[440px]:hidden">Get started</span>
            <ArrowUpRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
