import { ArrowRightIcon, LockKeyholeIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FAQS } from '../../data/brandProtection';

export function CTASection() {
  return (
    <section id="contact" className="bg-[color:var(--landing-surface)] px-6 pt-10 md:px-10 lg:pt-16">
      <div className="mx-auto max-w-[1240px] border-t border-border py-20">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="font-subheading text-sm tracking-[0.22em] text-primary">Frequently asked questions</p>
            <h2 className="mt-4 max-w-lg text-5xl font-semibold leading-[0.95] tracking-[-0.035em] text-foreground sm:text-6xl">Clear boundaries before work begins.</h2>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {FAQS.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 font-medium text-foreground marker:hidden">{question}<span className="float-right text-primary transition group-open:rotate-45" aria-hidden="true">+</span></summary>
                <p className="mt-3 max-w-2xl pr-8 text-sm leading-6 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1240px] overflow-hidden rounded-t-[2rem] bg-primary px-6 py-20 text-center text-primary-foreground sm:px-10 lg:py-24">
        <LockKeyholeIcon className="mx-auto h-6 w-6" aria-hidden="true" />
        <p className="mt-5 font-subheading text-sm tracking-[0.22em] opacity-75">Confidential consultation</p>
        <h2 className="mx-auto mt-4 max-w-4xl text-5xl font-semibold leading-[0.9] tracking-[-0.04em] sm:text-6xl lg:text-7xl">Counterfeiting costs revenue, reputation, and customer safety.</h2>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 opacity-80">Tell us what you are seeing. We will assess the exposure, clarify the available evidence, and agree whether an investigation or preventive review is appropriate.</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="mailto:help@fgiprp.com?subject=Confidential%20brand%20protection%20consultation" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--landing-hero-deep)] px-7 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5">Request consultation<ArrowRightIcon className="h-4 w-4" aria-hidden="true" /></a>
          <Link to="/auth/login" className="inline-flex min-h-12 items-center justify-center rounded-full border border-current/30 px-7 py-3 text-sm font-medium transition hover:bg-white/10">Client portal</Link>
        </div>
        <p className="mt-6 text-xs opacity-70">help@fgiprp.com · Existing clients should use the secure portal for matter information.</p>
      </div>
      <footer className="mx-auto flex max-w-[1240px] flex-col gap-5 border-t border-border py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div><p>© {new Date().getFullYear()} FORGEGUARD GLOBAL LIMITED. All rights reserved.</p><p className="mt-1">Brand protection, intellectual property intelligence, and local representation.</p></div>
        <div className="flex flex-wrap gap-5"><a href="#capabilities" className="transition hover:text-foreground">Services</a><a href="#workflow" className="transition hover:text-foreground">How we work</a><a href="mailto:help@fgiprp.com" className="transition hover:text-foreground">Contact</a><Link to="/auth/login" className="transition hover:text-foreground">Client sign in</Link></div>
      </footer>
    </section>
  );
}
