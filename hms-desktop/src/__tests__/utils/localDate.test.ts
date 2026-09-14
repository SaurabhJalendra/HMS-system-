import { describe, it, expect } from 'vitest';
import { daysAgoYmd, toLocalYmd } from '../../lib/utils/localDate';

describe('localDate', () => {
  it('returns YYYY-MM-DD for a Date in local time', () => {
    const d = new Date(2026, 8, 10, 22, 40, 0);
    expect(toLocalYmd(d)).toBe('2026-09-10');
  });

  it('keeps an already formatted date string', () => {
    expect(toLocalYmd('2026-09-10')).toBe('2026-09-10');
  });

  it('computes days ago from a known date', () => {
    const from = new Date(2026, 8, 14);
    expect(daysAgoYmd(5, from)).toBe('2026-09-09');
  });
});
