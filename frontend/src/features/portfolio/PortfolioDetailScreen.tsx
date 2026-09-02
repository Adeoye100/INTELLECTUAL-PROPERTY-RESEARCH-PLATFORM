import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Pencil } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Modal } from "../../components/Modal";
import type { PortfolioDetailRouteState, PortfolioMark } from "../../types";
import { ApiError } from "../../lib/api/client";
import { hasCapability } from "../auth/capabilities";
import { useAuthStore } from "../auth/authStore";
import { PortfolioMarkForm } from "./PortfolioMarkForm";
import { getRenewalWarning, portfolioStatusLabel } from "./portfolioDomain";
import { getPortfolioMark, patchPortfolioMark, type PatchPortfolioMarkRequest, type PortfolioMarkInput } from "./portfolioApi";

function markInput(mark: PortfolioMark): PortfolioMarkInput {
  return {
    markText: mark.markText,
    jurisdiction: mark.jurisdiction,
    sourceRegistry: mark.sourceRegistry,
    registryReference: mark.registryReference,
    niceClasses: mark.niceClasses,
    status: mark.status,
    filingDate: mark.filingDate,
    registrationDate: mark.registrationDate,
    renewalDate: mark.renewalDate,
  };
}

function changedFields(current: PortfolioMark, next: PortfolioMarkInput): PatchPortfolioMarkRequest {
  const before = markInput(current);
  return Object.fromEntries(Object.entries(next).filter(([field, value]) => {
    const existing = before[field as keyof PortfolioMarkInput];
    return Array.isArray(value) ? value.join(",") !== (existing as number[]).join(",") : value !== existing;
  })) as PatchPortfolioMarkRequest;
}

export function PortfolioDetailScreen() {
  const { markId = "" } = useParams<{ markId: string }>();
  const location = useLocation();
  const state = location.state as PortfolioDetailRouteState | null;
  const user = useAuthStore((store) => store.user);
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["portfolio-marks", "detail", markId], queryFn: () => getPortfolioMark(markId), retry: false });
  const update = useMutation({ mutationFn: ({ input }: { input: PatchPortfolioMarkRequest }) => patchPortfolioMark(markId, input) });
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const mark = detail.data ?? (detail.isLoading ? state?.mark : undefined);
  const canWrite = hasCapability(user?.role, "portfolio:write");
  const returnTo = state?.returnTo ?? "/portfolio";

  const submitEdit = async (input: PortfolioMarkInput) => {
    if (!detail.data) return;
    const patch = changedFields(detail.data, input);
    if (Object.keys(patch).length === 0) {
      setNotice({ type: "error", text: "Make a change before saving." });
      return;
    }
    setNotice(null);
    try {
      const updated = await update.mutateAsync({ input: patch });
      queryClient.setQueryData(["portfolio-marks", "detail", markId], updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio-marks"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "analytics"] }),
      ]);
      setIsEditing(false);
      setNotice({ type: "success", text: "Portfolio mark updated successfully." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof ApiError && error.serverCode === "PORTFOLIO_MARK_CONFLICT"
          ? "A portfolio mark with this registry reference already exists for this firm."
          : "The mark could not be updated. Check the fields and retry.",
      });
    }
  };

  if (!mark && detail.isLoading) return <p className="p-8 text-center" role="status">Loading portfolio mark…</p>;
  if (!mark && detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return <section role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-8 text-center"><h1 className="text-xl font-bold">{notFound ? "Portfolio mark not found" : "Mark detail unavailable"}</h1><p className="mt-2 text-text-secondary">{notFound ? "The mark may not exist in this firm." : "The mark could not be loaded."}</p>{!notFound && <Button className="mt-4" onClick={() => void detail.refetch()}>Retry mark detail</Button>}<Link className="mt-4 block font-bold text-forge-teal-700 underline" to={returnTo}>Back to portfolio</Link></section>;
  }
  if (!mark) return <p role="alert">Portfolio mark not found.</p>;

  const renewal = getRenewalWarning(mark.renewalDate);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><Link to={returnTo} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-forge-teal-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to filtered portfolio</Link><h1 className="font-mono text-2xl font-black text-text-primary">{mark.markText}</h1><p className="mt-1 text-sm text-text-secondary">{mark.sourceRegistry} · {mark.registryReference}</p></div>{canWrite && <Button variant="outline" onClick={() => { setNotice(null); setIsEditing(true); }}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Edit mark</Button>}</header>
    {detail.isLoading && <p role="status" className="rounded bg-forge-silver-100 p-3 text-sm">Refreshing portfolio mark…</p>}
    {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`rounded border p-4 ${notice.type === "error" ? "border-risk-high/30 bg-risk-high/10" : "border-risk-low/30 bg-risk-low/10"}`}>{notice.text}</div>}
    <section className="grid gap-4 md:grid-cols-3" aria-label="Portfolio mark summary"><Card title="Status"><Badge>{portfolioStatusLabel(mark.status)}</Badge><p className="mt-3 text-sm text-text-secondary">Jurisdiction: {mark.jurisdiction}</p></Card><Card title="Renewal"><p className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4" aria-hidden="true" />{mark.renewalDate ?? "Not recorded"}</p><Badge className="mt-3" risk={renewal.level}>{renewal.label}</Badge></Card><Card title="Nice classes"><p className="font-mono font-bold">{mark.niceClasses.join(", ")}</p><p className="mt-3 text-sm text-text-secondary">Updated {new Date(mark.updatedAt).toLocaleString()}</p></Card></section>
    <Card title="Record details"><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><Detail label="Mark text" value={mark.markText} /><Detail label="Jurisdiction" value={mark.jurisdiction} /><Detail label="Source registry" value={mark.sourceRegistry} /><Detail label="Registry reference" value={mark.registryReference} /><Detail label="Filing date" value={mark.filingDate ?? "Not recorded"} /><Detail label="Registration date" value={mark.registrationDate ?? "Not recorded"} /><Detail label="Renewal date" value={mark.renewalDate ?? "Not recorded"} /><Detail label="Created" value={new Date(mark.createdAt).toLocaleString()} /></dl></Card>
    <Card title="Lifecycle"><p className="text-sm text-text-secondary">Deletion is not available in this initial workflow because this mark may be referenced by watches, risk scores, alerts, or office-action records. Attachments, watch configuration, status history, registry synchronization, and PDF export are not available here.</p></Card>
    <Modal isOpen={isEditing} onClose={() => !update.isPending && setIsEditing(false)} title={`Edit ${mark.markText}`}><PortfolioMarkForm key={mark.updatedAt} formId="edit-portfolio-mark" initialValues={markInput(mark)} submitLabel="Save changes" isSubmitting={update.isPending} onCancel={() => setIsEditing(false)} onSubmit={submitEdit} /></Modal>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase text-text-secondary">{label}</dt><dd className="mt-1 text-text-primary">{value}</dd></div>;
}
