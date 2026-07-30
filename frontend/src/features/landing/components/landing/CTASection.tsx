import { Link } from 'react-router-dom';
export function CTASection() {
  return (
    <section className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-24 text-center border-t border-forge-silver-800/25">
      <h2 className="text-3xl md:text-5xl font-semibold text-forge-text-onDark max-w-2xl">
        Forge your brand's defense.
      </h2>
      <p className="mt-5 max-w-lg text-base md:text-lg text-forge-subtext-onDark">
        Request access to start searching, monitoring, and protecting your trademark
        portfolio today.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <Link
          to="/auth/signup"
          className="inline-flex items-center justify-center rounded-full bg-forge-silver-100 text-forge-navy px-8 py-3.5 text-sm font-semibold hover:bg-white transition-colors">
          
          Request Access
        </Link>
        <Link
          to="/auth/login"
          className="inline-flex items-center justify-center rounded-full border border-forge-silver-500/50 text-forge-text-onDark px-8 py-3.5 text-sm font-medium hover:bg-forge-silver-100/10 transition-colors">
          
          Sign in
        </Link>
      </div>
      <p className="mt-16 text-xs text-forge-silver-600">
        © {new Date().getFullYear()} Forge Global. All rights reserved.
      </p>
    </section>);
}