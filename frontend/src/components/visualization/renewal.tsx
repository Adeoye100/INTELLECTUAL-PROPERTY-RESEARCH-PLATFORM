import { CalendarDays } from 'lucide-react';
import { renewalDeadline } from './renewalDomain';
export function RenewalDeadlineFlag({ date, today }: { date: string | null | undefined; today?: Date }) {
  const result = renewalDeadline(date, today);
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold renewal-${result.state}`} aria-label={`${result.label}: ${date ?? 'not recorded'}`}><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /><span>{result.label}</span>{date && <span className="font-normal">{date} · {result.relative}</span>}</span>;
}
