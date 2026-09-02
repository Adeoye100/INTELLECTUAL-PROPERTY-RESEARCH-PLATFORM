import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../components/Button";
import type { CalendarDate, PortfolioMarkStatus } from "../../types";
import { portfolioMarkStatuses, portfolioStatusLabel } from "./portfolioDomain";
import type { PortfolioMarkInput } from "./portfolioApi";

interface PortfolioMarkFormProps {
  initialValues?: PortfolioMarkInput;
  formId: string;
  submitLabel: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit: (values: PortfolioMarkInput) => Promise<void> | void;
}

type Values = Omit<PortfolioMarkInput, "niceClasses" | "filingDate" | "registrationDate" | "renewalDate"> & {
  niceClasses: string;
  filingDate: string;
  registrationDate: string;
  renewalDate: string;
};

const empty: Values = { markText: "", jurisdiction: "", sourceRegistry: "", registryReference: "", niceClasses: "", status: "pending", filingDate: "", registrationDate: "", renewalDate: "" };
const asValues = (value?: PortfolioMarkInput): Values => value ? { ...value, niceClasses: value.niceClasses.join(", "), filingDate: value.filingDate ?? "", registrationDate: value.registrationDate ?? "", renewalDate: value.renewalDate ?? "" } : empty;

function validDate(value: string): value is CalendarDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parse(values: Values): { errors: Record<string, string>; input?: PortfolioMarkInput } {
  const errors: Record<string, string> = {};
  const markText = values.markText.trim().replace(/\s+/g, " ");
  const jurisdiction = values.jurisdiction.trim().toUpperCase();
  const sourceRegistry = values.sourceRegistry.trim().replace(/\s+/g, " ").toUpperCase();
  const registryReference = values.registryReference.trim().replace(/\s+/g, " ");
  const classTokens = values.niceClasses.split(",").map((value) => value.trim()).filter(Boolean);
  const niceClasses = classTokens.map(Number);
  if (!markText || markText.length > 200) errors.markText = "Enter a mark text of up to 200 characters.";
  if (!/^[A-Z0-9-]{1,8}$/.test(jurisdiction)) errors.jurisdiction = "Enter an ISO country or region code, for example US or EU.";
  if (!sourceRegistry || sourceRegistry.length > 100) errors.sourceRegistry = "Enter a source registry of up to 100 characters.";
  if (!registryReference || registryReference.length > 200) errors.registryReference = "Enter a registry reference of up to 200 characters.";
  if (!classTokens.length || classTokens.some((value) => !/^\d+$/.test(value)) || niceClasses.some((value) => value < 1 || value > 45)) errors.niceClasses = "Enter Nice classes from 1 through 45, separated by commas.";
  if (new Set(niceClasses).size !== niceClasses.length) errors.niceClasses = "Each Nice class may be listed only once.";
  if (!portfolioMarkStatuses.includes(values.status)) errors.status = "Choose a supported status.";
  for (const field of ["filingDate", "registrationDate", "renewalDate"] as const) if (values[field] && !validDate(values[field])) errors[field] = "Enter a real calendar date.";
  if (Object.keys(errors).length) return { errors };
  return { errors, input: { markText, jurisdiction, sourceRegistry, registryReference, niceClasses: [...niceClasses].sort((a, b) => a - b), status: values.status, filingDate: values.filingDate || null, registrationDate: values.registrationDate || null, renewalDate: values.renewalDate || null } };
}

export function PortfolioMarkForm({ initialValues, formId, submitLabel, cancelLabel = "Cancel", isSubmitting = false, onCancel, onSubmit }: PortfolioMarkFormProps) {
  const [values, setValues] = useState<Values>(() => asValues(initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = <Key extends keyof Values>(field: Key, value: Values[Key]) => { setValues((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: "" })); };
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const result = parse(values); setErrors(result.errors); if (result.input) await onSubmit(result.input); };
  const cls = "w-full rounded border border-forge-silver-300 bg-white px-3 py-2 text-text-primary";
  const error = (name: keyof Values) => errors[name] ? <p className="mt-1 text-xs text-risk-high" role="alert">{errors[name]}</p> : null;
  return <form id={formId} onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
    <Field label="Mark text" name="markText" values={values} onChange={change} inputClass={cls} error={error("markText")} autoFocus />
    <div className="grid gap-4 md:grid-cols-2"><Field label="Jurisdiction" name="jurisdiction" values={values} onChange={change} inputClass={cls} error={error("jurisdiction")} maxLength={8} placeholder="US" /><Field label="Source registry" name="sourceRegistry" values={values} onChange={change} inputClass={cls} error={error("sourceRegistry")} maxLength={100} placeholder="USPTO" /></div>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Registry reference" name="registryReference" values={values} onChange={change} inputClass={cls} error={error("registryReference")} maxLength={200} /><Field label="Nice classes" name="niceClasses" values={values} onChange={change} inputClass={cls} error={error("niceClasses")} placeholder="9, 35, 42" /></div>
    <div><label htmlFor={`${formId}-status`} className="mb-1 block text-sm font-bold">Status</label><select id={`${formId}-status`} value={values.status} onChange={(event) => change("status", event.target.value as PortfolioMarkStatus)} className={cls}>{portfolioMarkStatuses.map((status) => <option key={status} value={status}>{portfolioStatusLabel(status)}</option>)}</select>{error("status")}</div>
    <fieldset><legend className="mb-1 text-sm font-bold">Dates</legend><p className="mb-2 text-xs text-text-secondary">Dates are optional UTC-safe calendar dates.</p><div className="grid gap-4 md:grid-cols-3"><Field label="Filing date" name="filingDate" values={values} onChange={change} inputClass={cls} error={error("filingDate")} type="date" /><Field label="Registration date" name="registrationDate" values={values} onChange={change} inputClass={cls} error={error("registrationDate")} type="date" /><Field label="Renewal date" name="renewalDate" values={values} onChange={change} inputClass={cls} error={error("renewalDate")} type="date" /></div></fieldset>
    <div className="flex flex-wrap justify-end gap-3">{onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>{cancelLabel}</Button>}<Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : submitLabel}</Button></div>
  </form>;
}

function Field<Key extends keyof Values>({ label, name, values, onChange, inputClass, error, type = "text", ...rest }: { label: string; name: Key; values: Values; onChange: (name: Key, value: Values[Key]) => void; inputClass: string; error: ReactNode; type?: string; autoFocus?: boolean; maxLength?: number; placeholder?: string }) {
  const id = `portfolio-mark-${String(name)}`;
  return <div><label htmlFor={id} className="mb-1 block text-sm font-bold">{label}</label><input id={id} type={type} value={values[name] as string} onChange={(event) => onChange(name, event.target.value as Values[Key])} aria-invalid={Boolean(error)} className={inputClass} {...rest} />{error}</div>;
}
