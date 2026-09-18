import { describe, expect, it } from 'vitest';
import {
  computeUnitsToDispenseForLine,
  dosesPerDayFromFrequency,
  unitsForBillLine,
} from '../../lib/utils/prescriptionDispenseUnits';

describe('prescription dispense units', () => {
  it('treats TDS for 2 days as 6 tablets', () => {
    expect(dosesPerDayFromFrequency('TDS')).toBe(3);
    expect(
      computeUnitsToDispenseForLine({
        quantity: 1,
        frequency: 'TDS',
        duration: 2,
      }),
    ).toBe(6);
  });

  it('uses the same course size when billing a pharmacy line', () => {
    expect(
      unitsForBillLine({
        quantity: 1,
        frequency: 'TDS',
        duration: 2,
      }),
    ).toBe(6);
  });

  it('falls back to per-dose quantity when frequency is missing', () => {
    expect(unitsForBillLine({ quantity: 2, frequency: '', duration: 5 })).toBe(2);
  });
});
