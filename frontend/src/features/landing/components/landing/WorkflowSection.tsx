import { ArrowRightIcon, CheckCircle2Icon } from "lucide-react";
import { Link } from "react-router-dom";
import { ShieldStatic } from "./ShieldStatic";

const WORKFLOW_STEPS = [
  [
    "Search broadly",
    "Run a single query across connected registries and normalize the evidence.",
  ],
  [
    "Assess clearly",
    "Compare visual, phonetic, and class signals with explainable risk context.",
  ],
  [
    "Act continuously",
    "Save findings, prepare reports, and monitor the marks that matter.",
  ],
] as const;

export function WorkflowSection() {
  return (
    <section
      id="workflow"
      className="scroll-mt-20 bg-background px-6 py-24 md:px-10 lg:py-32"
    >
      <div className="mx-auto grid max-w-[1240px] gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="grid grid-cols-[0.34fr_0.66fr] gap-4">
          <div className="flex min-h-[170px] flex-col justify-between rounded-[1.25rem] bg-primary p-5 text-primary-foreground sm:min-h-[210px]">
            <CheckCircle2Icon className="h-6 w-6" aria-hidden="true" />
            <div>
              <p className="font-subheading text-4xl tracking-wide">6</p>
              <p className="mt-1 text-xs leading-5 opacity-75">
                Capabilities working as one system
              </p>
            </div>
          </div>
          <div className="relative flex min-h-[250px] items-center justify-center overflow-hidden rounded-[1.25rem] bg-[color:var(--landing-hero)] p-6 sm:min-h-[310px]">
            <div
              className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgb(159_194_212_/_25%),transparent_17rem)]"
              aria-hidden="true"
            />
            <div aria-hidden="true">
              <ShieldStatic
                animated={false}
                size={240}
                className="relative h-auto w-[min(48vw,240px)] max-w-full"
              />
            </div>
          </div>
          <div className="col-span-2 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-border bg-card p-6 text-card-foreground">
              <p className="font-subheading text-sm tracking-[0.18em] text-primary">
                Explainable by design
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Evidence remains visible beside risk signals, so research is
                reviewable rather than opaque.
              </p>
            </div>
            <div className="rounded-[1.25rem] bg-secondary p-6 text-secondary-foreground">
              <p className="font-subheading text-sm tracking-[0.18em] text-primary">
                Firm-scoped workspace
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Role-aware access keeps each organization’s matters, users, and
                research boundaries clear.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="font-subheading text-sm tracking-[0.22em] text-primary">
            From question to defensible action
          </p>
          <h2 className="mt-4 max-w-2xl text-5xl font-semibold leading-[0.95] tracking-[-0.035em] text-foreground sm:text-6xl">
            A complete research flow, without the fragmented tooling.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
            Forge Global connects discovery, analysis, precedent, portfolio
            context, and reporting so your team can spend less time assembling
            evidence and more time making sound decisions.
          </p>

          <ol className="mt-9 space-y-5">
            {WORKFLOW_STEPS.map(([title, description], index) => (
              <li
                key={title}
                className="grid grid-cols-[auto_1fr] gap-4 border-t border-border pt-5"
              >
                <span className="font-subheading text-xl tracking-wider text-primary">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="font-subheading text-2xl tracking-wide text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Link
            to="/auth/create-organization"
            className="mt-9 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5"
          >
            Build your research workspace
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
