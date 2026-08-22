import React from 'react';
import { AlertCircle, CheckCircle2, Circle, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { type RiskRating } from '../../styles/visualTokens';

export function ChartCard({ title, description, children, className = '' }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  const id = `chart-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <section className={`rounded-lg border border-forge-silver-300 bg-surface-card p-5 ${className}`} aria-labelledby={id}>
    <header className="mb-4"><h2 id={id} className="text-lg font-semibold text-text-primary">{title}</h2>{description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}</header>{children}
  </section>;
}
export const ChartSkeleton = ({ label = 'Loading chart' }: { label?: string }) => <div className="flex min-h-48 items-center justify-center rounded border border-forge-silver-100 bg-surface-base" role="status" aria-label={label}><span className="animate-pulse motion-reduce:animate-none text-sm text-text-secondary">{label}…</span></div>;
export const ChartEmptyState = ({ message }: { message: string }) => <p className="flex min-h-32 items-center justify-center rounded border border-dashed border-forge-silver-300 p-5 text-center text-sm text-text-secondary">{message}</p>;
export const ChartErrorState = ({ message = 'This chart could not be loaded.' }: { message?: string }) => <p className="flex min-h-32 items-center justify-center rounded border border-risk-high/30 bg-risk-high/5 p-5 text-center text-sm text-text-secondary" role="alert">{message}</p>;

export function AccessibleDataTable({ caption, rows }: { caption: string; rows: Array<{ label: string; value: string; detail?: string }> }) {
  return <table className="mt-3 w-full text-left text-sm"><caption className="sr-only">{caption}</caption><tbody>{rows.map((row) => <tr key={row.label} className="border-b border-forge-silver-100 last:border-0"><th scope="row" className="py-2 font-medium text-text-primary">{row.label}</th><td className="py-2 text-right font-semibold text-text-primary">{row.value}{row.detail && <span className="ml-2 font-normal text-text-secondary">{row.detail}</span>}</td></tr>)}</tbody></table>;
}

export function RiskBadge({ rating, score, compact = false }: { rating: string | null | undefined; score?: number | null; compact?: boolean }) {
  const normalized = typeof rating === 'string' ? rating.toLowerCase() : '';
  const safe = (['low', 'medium', 'high'] as const).includes(normalized as RiskRating) ? normalized as RiskRating : null;
  const Icon = safe === 'low' ? ShieldCheck : safe === 'medium' ? ShieldAlert : safe === 'high' ? AlertCircle : ShieldQuestion;
  const label = safe ? `${safe[0].toUpperCase()}${safe.slice(1)} risk` : 'Unknown risk';
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-bold uppercase tracking-wide ${safe ? `risk-${safe}` : 'border-forge-silver-300 bg-forge-silver-100 text-text-secondary'} ${compact ? 'text-[0.65rem]' : ''}`} aria-label={`${label}${typeof score === 'number' ? `, score ${score} out of 100` : ''}`}>
    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}{typeof score === 'number' && <span className="font-mono">{Math.round(score)}/100</span>}
  </span>;
}

export type SourceState = 'complete' | 'pending' | 'unavailable' | 'delayed';
export function SourceStatusIndicator({ source, status, resultCount, explanation }: { source: string; status: SourceState; resultCount?: number; explanation?: string }) {
  const state = status === 'complete' ? 'Responded' : status === 'delayed' ? 'Pending' : status[0].toUpperCase() + status.slice(1);
  const Icon = status === 'complete' ? CheckCircle2 : status === 'unavailable' ? AlertCircle : Circle;
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold source-${status}`} aria-label={`${source}: ${state}${typeof resultCount === 'number' ? `, ${resultCount} results` : ''}`} title={explanation}>
    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{source}: {state}{typeof resultCount === 'number' && ` (${resultCount})`}
  </span>;
}
