import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router-dom";

export function CTASection() {
  return (
    <section className="bg-[color:var(--landing-surface)] px-6 pt-20 md:px-10 lg:pt-28">
      <div className="mx-auto max-w-[1240px] overflow-hidden rounded-t-[2rem] bg-primary px-6 py-20 text-center text-primary-foreground sm:px-10 lg:py-24">
        <p className="font-subheading text-sm tracking-[0.22em] opacity-75">
          Research with clarity
        </p>
        <h2 className="mx-auto mt-4 max-w-4xl text-5xl font-semibold leading-[0.9] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          Give every IP decision a stronger evidence trail.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 opacity-80">
          Create your organization’s workspace, or sign in to continue research
          with your existing team.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/auth/create-organization"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--landing-hero-deep)] px-7 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          >
            Create organization
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/auth/login"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-current/30 px-7 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            Sign in
          </Link>
        </div>
      </div>

      <footer className="mx-auto flex max-w-[1240px] flex-col gap-5 border-t border-border py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} Forge Global. Intellectual property
          research, made coherent.
        </p>
        <div className="flex flex-wrap gap-5">
          <a href="#capabilities" className="transition hover:text-foreground">
            Capabilities
          </a>
          <a href="#workflow" className="transition hover:text-foreground">
            How it works
          </a>
          <Link to="/auth/login" className="transition hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </section>
  );
}
