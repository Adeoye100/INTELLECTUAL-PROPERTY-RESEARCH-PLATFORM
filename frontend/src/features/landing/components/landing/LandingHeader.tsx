import { Link } from 'react-router-dom';
import { ShieldStatic } from './ShieldStatic';
export function LandingHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-30 flex items-center justify-between px-6 md:px-10 py-5">
      <Link to="/" className="flex items-center gap-2.5">
        <ShieldStatic size={22} animated={false} />
        <span className="font-semibold tracking-[0.18em] text-forge-text-onDark text-sm uppercase">
          Forge Global
        </span>
      </Link>
      <nav className="flex items-center gap-3 md:gap-5" aria-label="Primary">
        <Link
          to="/auth/login"
          className="text-sm text-forge-subtext-onDark hover:text-forge-text-onDark transition-colors">
          
          Sign in
        </Link>
        <Link
          to="/auth/signup"
          className="inline-flex items-center rounded-full border border-forge-silver-400/50 bg-forge-silver-100/5 px-4 py-2 text-sm font-medium text-forge-text-onDark hover:bg-forge-silver-100/15 transition-colors">
          
          Request Access
        </Link>
      </nav>
    </header>);
}