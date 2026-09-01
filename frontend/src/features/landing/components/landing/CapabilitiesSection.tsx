import {
  BellRingIcon,
  FileSearchIcon,
  FolderKanbanIcon,
  RadarIcon,
  ScanSearchIcon,
  ScrollTextIcon,
  type LucideIcon,
} from "lucide-react";
import { FACETS } from "../../data/facets";

const CAPABILITY_ICONS: LucideIcon[] = [
  ScanSearchIcon,
  RadarIcon,
  FileSearchIcon,
  FolderKanbanIcon,
  BellRingIcon,
  ScrollTextIcon,
];

function cardTone(index: number) {
  if (index === 1) return "bg-primary text-primary-foreground border-primary";
  if (index === 2)
    return "bg-[color:var(--landing-hero)] text-white border-[color:var(--landing-hero)]";
  return "bg-card text-card-foreground border-border";
}

export function CapabilitiesSection() {
  return (
    <section
      id="capabilities"
      className="scroll-mt-20 bg-[color:var(--landing-surface)] px-6 py-24 md:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-8 border-b border-border pb-12 lg:grid-cols-[1fr_0.82fr] lg:items-end">
          <div>
            <p className="font-subheading text-sm tracking-[0.22em] text-primary">
              The research advantage
            </p>
            <h2 className="mt-4 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-7xl">
              Essential intelligence for confident IP decisions.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            Move from fragmented registry tabs and isolated documents to a
            connected research workflow where every finding can be traced,
            compared, and prepared for action.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FACETS.map((facet) => {
            const Icon = CAPABILITY_ICONS[facet.index];
            const isStrong = facet.index === 1 || facet.index === 2;

            return (
              <article
                key={facet.id}
                className={`group relative flex min-h-[310px] flex-col overflow-hidden rounded-[1.25rem] border p-7 transition duration-300 hover:-translate-y-1 ${cardTone(facet.index)}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-full border ${isStrong ? "border-white/25 bg-white/10" : "border-border bg-secondary"}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span
                    className={`font-subheading text-sm tracking-[0.18em] ${isStrong ? "text-current/65" : "text-muted-foreground"}`}
                  >
                    0{facet.index + 1}
                  </span>
                </div>
                <div className="mt-auto pt-12">
                  <h3 className="font-subheading text-3xl tracking-[0.02em]">
                    {facet.title}
                  </h3>
                  <p
                    className={`mt-4 text-sm leading-6 ${isStrong ? "text-current/78" : "text-muted-foreground"}`}
                  >
                    {facet.description}
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className={`absolute -bottom-16 -right-16 h-40 w-40 rounded-full border transition-transform duration-500 group-hover:scale-110 ${isStrong ? "border-white/12" : "border-primary/15"}`}
                />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
