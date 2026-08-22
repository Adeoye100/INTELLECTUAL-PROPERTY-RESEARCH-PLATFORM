export type RenewalState = 'overdue' | 'due-soon' | 'upcoming' | 'no-date' | 'normal';
export function renewalDeadline(date: string | null | undefined, today = new Date()): { state: RenewalState; label: string; relative: string } {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { state: 'no-date', label: 'No renewal date', relative: 'Date not recorded' };
  const [y, m, d] = date.split('-').map(Number); const target = Date.UTC(y, m - 1, d); const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()); const days = Math.round((target - now) / 86400000);
  if (days < 0) return { state: 'overdue', label: 'Overdue', relative: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` };
  if (days <= 30) return { state: 'due-soon', label: 'Due soon', relative: `Due in ${days} day${days === 1 ? '' : 's'}` };
  if (days <= 90) return { state: 'upcoming', label: 'Upcoming', relative: `Due in ${days} days` };
  return { state: 'normal', label: 'Upcoming', relative: `Due in ${days} days` };
}
