import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, FilterX, Plus, Search } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Modal } from "../../components/Modal";
import type { PortfolioDetailRouteState, PortfolioMark, PortfolioMarkStatus } from "../../types";
import { ApiError } from "../../lib/api/client";
import { hasCapability } from "../auth/capabilities";
import { useAuthStore } from "../auth/authStore";
import { PortfolioMarkForm } from "./PortfolioMarkForm";
import {
  portfolioFiltersFromParams,
  portfolioFiltersToParams,
  portfolioListQuery,
  portfolioMarkStatuses,
  portfolioPageFromParams,
  portfolioStatusLabel,
  type PortfolioFilters,
} from "./portfolioDomain";
import { createPortfolioMark, listPortfolioMarks } from "./portfolioApi";

function portfolioQueryKey(query: ReturnType<typeof portfolioListQuery>) {
  return ["portfolio-marks", query] as const;
}

export function PortfolioScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const filters = portfolioFiltersFromParams(searchParams);
  const page = portfolioPageFromParams(searchParams);
  const query = portfolioListQuery(filters, page);
  const canWrite = hasCapability(user?.role, "portfolio:write");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string; mark?: PortfolioMark } | null>(null);
  const portfolio = useQuery({ queryKey: portfolioQueryKey(query), queryFn: () => listPortfolioMarks(query), retry: false });
  const create = useMutation({ mutationFn: createPortfolioMark });

  const updateUrl = (nextFilters: PortfolioFilters, nextPage = 1) => {
    setSearchParams(portfolioFiltersToParams(nextFilters, nextPage), { replace: true });
  };
  const setFilter = <Key extends keyof PortfolioFilters>(key: Key, value: PortfolioFilters[Key]) => {
    const normalized = portfolioFiltersFromParams(portfolioFiltersToParams({ ...filters, [key]: value }));
    updateUrl(normalized);
  };
  const setPage = (nextPage: number) => updateUrl(filters, nextPage);

  const submitCreate = async (input: Parameters<typeof createPortfolioMark>[0]) => {
    setNotice(null);
    try {
      const created = await create.mutateAsync(input);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio-marks"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "analytics"] }),
      ]);
      setIsAddOpen(false);
      setNotice({ type: "success", text: "Portfolio mark added successfully.", mark: created });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof ApiError && error.serverCode === "PORTFOLIO_MARK_CONFLICT"
          ? "A portfolio mark with this registry reference already exists for this firm."
          : "The mark could not be added. Check the fields and retry.",
      });
    }
  };

  if (portfolio.isLoading) return <div className="p-8 text-center" role="status">Loading portfolio marks…</div>;
  if (portfolio.isError) return <section role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-8 text-center"><h1 className="text-xl font-bold">Portfolio unavailable</h1><p className="mt-2 text-text-secondary">Portfolio records could not be loaded.</p><Button className="mt-4" onClick={() => void portfolio.refetch()}>Retry portfolio</Button></section>;

  const response = portfolio.data;
  const marks = response?.items ?? [];
  const pagination = response?.pagination ?? { page, pageSize: 25, total: 0, totalPages: 0 };
  const detailState = (mark: PortfolioMark): PortfolioDetailRouteState => ({ mark, returnTo: `${location.pathname}${location.search}` });

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-text-primary">Portfolio</h1><p className="text-sm text-text-secondary">Firm-scoped trademark records. {canWrite ? "Add or update supported fields." : "Read-only access for this role."}</p></div>{canWrite && <Button onClick={() => { setNotice(null); setIsAddOpen(true); }}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add mark</Button>}</header>
    {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`rounded border p-4 ${notice.type === "error" ? "border-risk-high/30 bg-risk-high/10" : "border-risk-low/30 bg-risk-low/10"}`}><p>{notice.text}</p>{notice.mark && <Link className="mt-2 inline-block font-bold text-forge-teal-700 underline" to={`/portfolio/${notice.mark.id}`} state={detailState(notice.mark)}>View {notice.mark.markText}</Link>}</div>}

    <Card title="Filter portfolio">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div><label htmlFor="portfolio-query" className="mb-1 block text-sm font-bold">Mark text</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-secondary" aria-hidden="true" /><input id="portfolio-query" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} maxLength={200} className="w-full rounded border border-forge-silver-300 py-2 pl-9 pr-3" /></div></div>
        <div><label htmlFor="portfolio-jurisdiction" className="mb-1 block text-sm font-bold">Jurisdiction</label><input id="portfolio-jurisdiction" value={filters.jurisdiction} onChange={(event) => setFilter("jurisdiction", event.target.value)} maxLength={8} placeholder="US" className="w-full rounded border border-forge-silver-300 px-3 py-2" /></div>
        <div><label htmlFor="portfolio-registry" className="mb-1 block text-sm font-bold">Source registry</label><input id="portfolio-registry" value={filters.sourceRegistry} onChange={(event) => setFilter("sourceRegistry", event.target.value)} maxLength={100} placeholder="USPTO" className="w-full rounded border border-forge-silver-300 px-3 py-2" /></div>
        <div><label htmlFor="portfolio-reference" className="mb-1 block text-sm font-bold">Registry reference</label><input id="portfolio-reference" value={filters.registryReference} onChange={(event) => setFilter("registryReference", event.target.value)} maxLength={200} className="w-full rounded border border-forge-silver-300 px-3 py-2" /></div>
        <div><label htmlFor="portfolio-status" className="mb-1 block text-sm font-bold">Status</label><select id="portfolio-status" value={filters.status} onChange={(event) => setFilter("status", event.target.value as PortfolioMarkStatus | "")} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="">All statuses</option>{portfolioMarkStatuses.map((status) => <option key={status} value={status}>{portfolioStatusLabel(status)}</option>)}</select></div>
        <div><label htmlFor="portfolio-nice-class" className="mb-1 block text-sm font-bold">Nice class</label><input id="portfolio-nice-class" type="number" min="1" max="45" value={filters.niceClass} onChange={(event) => setFilter("niceClass", event.target.value)} className="w-full rounded border border-forge-silver-300 px-3 py-2" /></div>
        <div><label htmlFor="portfolio-renewal" className="mb-1 block text-sm font-bold">Renewal window</label><select id="portfolio-renewal" value={filters.renewalWindow} onChange={(event) => setFilter("renewalWindow", event.target.value as PortfolioFilters["renewalWindow"])} className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2"><option value="all">Any date</option><option value="overdue">Overdue</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option><option value="365">Next year</option></select></div>
        <div className="flex items-end"><Button variant="ghost" onClick={() => updateUrl(portfolioFiltersFromParams(new URLSearchParams()))}><FilterX className="mr-2 h-4 w-4" aria-hidden="true" />Clear filters</Button></div>
      </div>
    </Card>

    <section aria-live="polite" aria-atomic="true"><p className="text-sm text-text-secondary">{pagination.total} {pagination.total === 1 ? "portfolio mark" : "portfolio marks"} · Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</p></section>
    {marks.length === 0 ? <Card><p className="py-8 text-center text-text-secondary">No portfolio marks have been added to this firm yet.</p></Card> : <>
      <Card className="hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-left"><caption className="sr-only">Portfolio marks</caption><thead><tr className="border-b border-forge-silver-300">{["Mark", "Registry", "Classes", "Status", "Renewal date", "Actions"].map((heading) => <th key={heading} scope="col" className="px-3 py-2 text-xs font-bold uppercase text-text-secondary">{heading}</th>)}</tr></thead><tbody>{marks.map((mark) => <tr key={mark.id} className="border-b border-forge-silver-100 last:border-0"><th scope="row" className="px-3 py-3 font-mono font-bold text-text-primary">{mark.markText}</th><td className="px-3 py-3 text-sm">{mark.sourceRegistry} · {mark.registryReference}<br /><span className="text-text-secondary">{mark.jurisdiction}</span></td><td className="px-3 py-3">{mark.niceClasses.join(", ")}</td><td className="px-3 py-3"><Badge>{portfolioStatusLabel(mark.status)}</Badge></td><td className="px-3 py-3"><span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4" aria-hidden="true" />{mark.renewalDate ?? "Not recorded"}</span></td><td className="px-3 py-3"><Link to={`/portfolio/${mark.id}`} state={detailState(mark)} className="rounded border border-forge-silver-500 px-3 py-1.5 text-sm font-medium text-text-primary">Details</Link></td></tr>)}</tbody></table></div></Card>
      <div className="space-y-3 md:hidden">{marks.map((mark) => <Card key={mark.id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-mono font-bold text-text-primary">{mark.markText}</h2><p className="mt-1 text-sm text-text-secondary">{mark.sourceRegistry} · {mark.registryReference}</p></div><Badge>{portfolioStatusLabel(mark.status)}</Badge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-text-secondary">Jurisdiction</dt><dd>{mark.jurisdiction}</dd></div><div><dt className="text-text-secondary">Nice classes</dt><dd>{mark.niceClasses.join(", ")}</dd></div><div><dt className="text-text-secondary">Renewal</dt><dd>{mark.renewalDate ?? "Not recorded"}</dd></div></dl><Link to={`/portfolio/${mark.id}`} state={detailState(mark)} className="mt-4 inline-block font-bold text-forge-teal-700 underline">View details</Link></Card>)}</div>
    </>}
    {pagination.totalPages > 1 && <nav className="flex items-center justify-between gap-3" aria-label="Portfolio pagination"><Button variant="outline" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>Previous</Button><span className="text-sm text-text-secondary">Page {pagination.page} of {pagination.totalPages}</span><Button variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>Next</Button></nav>}
    <Modal isOpen={isAddOpen} onClose={() => !create.isPending && setIsAddOpen(false)} title="Add a portfolio mark"><PortfolioMarkForm formId="add-portfolio-mark" submitLabel="Add mark" isSubmitting={create.isPending} onCancel={() => setIsAddOpen(false)} onSubmit={submitCreate} /></Modal>
  </div>;
}
