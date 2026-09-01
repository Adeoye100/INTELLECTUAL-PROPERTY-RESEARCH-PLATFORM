import { Link } from 'react-router-dom';
export function CTASection() {
  return (
    <section className="min-h-[70vh] flex flex-col items-center justify-center text-center border-t border-forge-silver-800/25">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
        <h2 className="max-w-2xl font-special text-3xl font-light italic text-forge-text-onDark md:text-5xl">
          Forge your brand's defense.
        </h2>
        <p className="mt-5 max-w-lg text-base md:text-lg text-forge-subtext-onDark">
          Start a new firm or join an existing firm by invitation to protect your trademark
          portfolio.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            to="/auth/create-organization"
            className="inline-flex items-center justify-center rounded-full bg-forge-silver-100 text-forge-navy px-8 py-3.5 text-sm font-semibold hover:bg-white transition-colors">
            
            Create organization
          </Link>
          <Link
            to="/auth/login"
            className="inline-flex items-center justify-center rounded-full border border-forge-silver-500/50 text-forge-text-onDark px-8 py-3.5 text-sm font-medium hover:bg-forge-silver-100/10 transition-colors">
            
            Sign in
          </Link>
        </div>
      </div>
      <footer className="w-full bg-forge-navy-950/90 py-8 backdrop-blur-sm">
        <p className="text-xs text-forge-silver-400">
          © {new Date().getFullYear()} Forge Global. All rights reserved.
        </p>
      </footer>
    </section>);
}
