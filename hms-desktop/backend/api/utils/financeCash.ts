export function cashReceivedForInvoice(status: string, totalAmount: number, paidAmount?: number | null): number {
  const total = Number(totalAmount || 0);
  const received = paidAmount == null ? null : Number(paidAmount);

  if (status === 'PAID') {
    return received != null && Number.isFinite(received) ? received : total;
  }
  if (status === 'PARTIAL') {
    return received != null && Number.isFinite(received) ? received : 0;
  }
  return 0;
}

export function cashEventDate(paidAt?: Date | string | null, fallback?: Date | string | null): Date | null {
  const raw = paidAt || fallback;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDateInsideRange(date: Date | null, start: Date, end: Date): boolean {
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function parseLocalDayStart(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function parseLocalDayEnd(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function parseLocalDateInput(isoDate?: string | null) {
  if (!isoDate) return new Date();
  const trimmed = isoDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseLocalDayStart(trimmed);
  }
  return new Date(trimmed);
}
