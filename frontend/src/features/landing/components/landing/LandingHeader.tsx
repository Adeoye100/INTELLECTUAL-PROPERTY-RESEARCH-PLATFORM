import { Link } from 'react-router-dom';
interface LandingHeaderProps {
  logoAvailable?: boolean;
}

export function LandingHeader({ logoAvailable = true }: LandingHeaderProps) {
  return (
    <header className="fixed top-0 inset-x-0 z-30 bg-forge-navy-950/90 px-4 py-3 backdrop-blur-sm md:px-10">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 min-[421px]:flex min-[421px]:justify-between md:gap-5">
        <Link to="/" className="flex items-center gap-2 overflow-hidden md:gap-2.5">
          {logoAvailable ? (
            <img
              src="/logo.png"
              alt="Forge Global logo"
              className="h-8 w-auto object-contain min-[421px]:h-10 md:h-12 lg:h-16"
            />
          ) : (
            <span aria-hidden="true" className="h-8 w-8 shrink-0 min-[421px]:h-10 min-[421px]:w-10 md:h-12 md:w-12 lg:h-16 lg:w-16" />
          )}
          <span className="truncate font-semibold uppercase tracking-[0.18em] text-[10px] text-forge-text-onDark sm:text-xs md:text-sm">
            Forge Global
          </span>
        </Link>

        <nav
          className="col-span-2 flex items-center justify-end gap-3 min-[421px]:col-auto min-[421px]:gap-4 md:gap-6"
          aria-label="Primary"
        >
          <Link
            to="/auth/login"
            className="whitespace-nowrap text-xs text-white transition-colors hover:text-forge-silver-200 sm:text-sm"
          >
            Sign in
          </Link>
          <Link
            to="/auth/create-organization"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-forge-silver-400/50 bg-forge-silver-100/5 px-4 py-2 text-xs font-medium text-forge-text-onDark transition-colors hover:bg-forge-silver-100/15 sm:text-sm"
          >
            Create organization
          </Link>
        </nav>
      </div>
    </header>
  );
}
