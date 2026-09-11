import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { listPortfolioMarks } from '../portfolio/portfolioApi';
import { createOfficeActionRef } from './officeActionApi';
import type { OfficeActionSearchResult } from '../../types';

type FormState = {
  portfolioMarkId: string;
  sourceRegistry: string;
  sourceReferenceId: string;
  applicationNumber: string;
  documentType: string;
  officeActionDate: string;
  examinerName: string;
  examinerReasoningSummary: string;
  sourceDocumentUrl: string;
};

const initialForm: FormState = {
  portfolioMarkId: '', sourceRegistry: 'USPTO', sourceReferenceId: '', applicationNumber: '',
  documentType: 'office_action', officeActionDate: '', examinerName: '', examinerReasoningSummary: '', sourceDocumentUrl: '',
};

export function PreliminaryOfficeActionScreen() {
  const portfolio = useQuery({ queryKey: ['portfolio', 'office-action-intake'], queryFn: () => listPortfolioMarks({ pageSize: 100 }).then((response) => response.items), retry: false });
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setNotice(null); setError(null);
    try {
      const selected = portfolio.data?.find((mark) => mark.id === form.portfolioMarkId);
      if (!selected) throw new Error('Choose a portfolio mark.');
      const item: OfficeActionSearchResult = {
        sourceRegistry: form.sourceRegistry.trim().toUpperCase(),
        sourceReferenceId: form.sourceReferenceId.trim(),
        applicationNumber: form.applicationNumber.trim(),
        markText: selected.markText,
        owner: '',
        jurisdiction: selected.jurisdiction,
        documentType: form.documentType,
        officeActionDate: form.officeActionDate,
        examinerName: form.examinerName.trim(),
        examinerReasoningSummary: form.examinerReasoningSummary.trim(),
        summaryMethod: 'manual',
        sourceDocumentUrl: form.sourceDocumentUrl.trim() || undefined,
        sourceMetadata: { sourceRecordType: 'manual-intake' },
      };
      await createOfficeActionRef(form.portfolioMarkId, item);
      setNotice('Office Action reference saved to the selected portfolio mark.');
      setForm((current) => ({ ...initialForm, portfolioMarkId: current.portfolioMarkId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Office Action reference could not be saved.');
    } finally { setSaving(false); }
  };

  const inputClass = 'mt-1 w-full rounded border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-forge-teal-700">Preliminary research mode</p><h1 className="mt-2 text-3xl font-bold text-foreground">Office Action Research</h1><p className="mt-2 max-w-3xl text-muted-foreground">Capture and organise verified Office Action references manually while automated corpus search remains unavailable.</p></header>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4" role="note"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /><div><p className="font-semibold text-foreground">Automated USPTO Office Action search is not active.</p><p className="mt-1 text-sm text-muted-foreground">Only enter references you have independently verified. The platform stores your supplied reference and summary; it does not claim to discover or validate it automatically.</p></div></div></div>

      {notice && <p role="status" className="rounded border border-emerald-500/30 bg-emerald-500/10 p-4 text-foreground">{notice}</p>}
      {error && <p role="alert" className="rounded border border-risk-high/30 bg-risk-high/10 p-4 text-risk-high">{error}</p>}

      <Card title="Add verified Office Action reference">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-foreground">Portfolio mark<select required value={form.portfolioMarkId} onChange={(event) => setForm((current) => ({ ...current, portfolioMarkId: event.target.value }))} className={inputClass}><option value="">Choose a saved mark</option>{portfolio.data?.map((mark) => <option key={mark.id} value={mark.id}>{mark.markText} · {mark.jurisdiction}</option>)}</select></label>
          <label className="text-sm font-semibold text-foreground">Source registry<input required value={form.sourceRegistry} onChange={(event) => setForm((current) => ({ ...current, sourceRegistry: event.target.value }))} className={inputClass} /></label>
          <label className="text-sm font-semibold text-foreground">Source reference ID<input required value={form.sourceReferenceId} onChange={(event) => setForm((current) => ({ ...current, sourceReferenceId: event.target.value }))} className={inputClass} placeholder="Verified document/reference ID" /></label>
          <label className="text-sm font-semibold text-foreground">Application number<input value={form.applicationNumber} onChange={(event) => setForm((current) => ({ ...current, applicationNumber: event.target.value }))} className={inputClass} /></label>
          <label className="text-sm font-semibold text-foreground">Document type<select value={form.documentType} onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))} className={inputClass}><option value="office_action">Office Action</option><option value="non_final_office_action">Non-Final Office Action</option><option value="final_office_action">Final Office Action</option><option value="suspension">Suspension</option><option value="restriction_requirement">Restriction Requirement</option><option value="other">Other Document</option></select></label>
          <label className="text-sm font-semibold text-foreground">Office Action date<input type="date" value={form.officeActionDate} onChange={(event) => setForm((current) => ({ ...current, officeActionDate: event.target.value }))} className={inputClass} /></label>
          <label className="text-sm font-semibold text-foreground">Examiner name<input value={form.examinerName} onChange={(event) => setForm((current) => ({ ...current, examinerName: event.target.value }))} className={inputClass} /></label>
          <label className="text-sm font-semibold text-foreground">Source document URL<input type="url" value={form.sourceDocumentUrl} onChange={(event) => setForm((current) => ({ ...current, sourceDocumentUrl: event.target.value }))} className={inputClass} placeholder="https://..." /></label>
          <label className="text-sm font-semibold text-foreground md:col-span-2">Examiner reasoning / research notes<textarea rows={6} value={form.examinerReasoningSummary} onChange={(event) => setForm((current) => ({ ...current, examinerReasoningSummary: event.target.value }))} className={inputClass} placeholder="Plain-text verified summary or notes" /></label>
          <div className="md:col-span-2"><Button type="submit" disabled={saving || portfolio.isLoading}><FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />{saving ? 'Saving…' : 'Save reference'}</Button></div>
        </form>
      </Card>
    </div>
  );
}
