// Shared formatting helpers for Treasury & Accounting modules

export function fmtNaira(n: number | null | undefined): string {
  return '₦' + (Number(n) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

export function fmtNaira2(n: number | null | undefined): string {
  return '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysBetween(start: Date | string, end: Date | string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function addDays(date: Date | string, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Compute the maturity date from a purchase/start date and a tenor in days. */
export function computeMaturity(startDate: Date | string, tenorDays: number): Date {
  return addDays(startDate, Number(tenorDays) || 0);
}
