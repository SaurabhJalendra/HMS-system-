import {
  cashReceivedForInvoice,
  isDateInsideRange,
  parseLocalDateInput,
  parseLocalDayEnd,
  parseLocalDayStart,
} from '../../utils/financeCash';

describe('financeCash', () => {
  it('books a paid invoice as money received', () => {
    expect(cashReceivedForInvoice('PAID', 10000, null)).toBe(10000);
    expect(cashReceivedForInvoice('PAID', 10000, 10000)).toBe(10000);
  });

  it('books a partial invoice as the amount received only', () => {
    expect(cashReceivedForInvoice('PARTIAL', 10000, 3000)).toBe(3000);
    expect(cashReceivedForInvoice('PARTIAL', 20000, 8000)).toBe(8000);
    expect(cashReceivedForInvoice('PARTIAL', 10000, null)).toBe(0);
    expect(cashReceivedForInvoice('PARTIAL', { toNumber: () => 20000 }, { toNumber: () => 8000 })).toBe(8000);
  });

  it('ignores pending and cancelled invoices', () => {
    expect(cashReceivedForInvoice('PENDING', 5000, null)).toBe(0);
    expect(cashReceivedForInvoice('CANCELLED', 5000, 5000)).toBe(0);
  });

  it('keeps a payment inside a local day window', () => {
    const start = new Date(2026, 8, 1, 0, 0, 0, 0);
    const end = new Date(2026, 8, 1, 23, 59, 59, 999);
    expect(isDateInsideRange(new Date(2026, 8, 1, 22, 40, 0), start, end)).toBe(true);
    expect(isDateInsideRange(new Date(2026, 7, 31, 22, 40, 0), start, end)).toBe(false);
  });

  it('parses YYYY-MM-DD as a clinic-local day, not UTC midnight', () => {
    const start = parseLocalDayStart('2026-09-01');
    const end = parseLocalDayEnd('2026-09-01');
    const salaryOnFirst = parseLocalDateInput('2026-09-01');
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(isDateInsideRange(salaryOnFirst, start, end)).toBe(true);
  });
});
