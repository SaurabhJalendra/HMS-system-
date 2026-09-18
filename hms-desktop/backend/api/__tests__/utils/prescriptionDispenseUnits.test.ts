import {
  computeUnitsToDispenseForLine,
  dosesPerDayFromFrequency,
  unitsForBillLine,
} from '../../utils/prescriptionDispenseUnits';

describe('prescription dispense units', () => {
  it.each([
    ['1-0-1', 2],
    ['OD', 1],
    ['BD', 2],
    ['TDS', 3],
    ['QID', 4],
    ['twice daily', 2],
    ['3 times per day', 3],
    ['every 8 hours', 3],
  ])('parses %s as %i dose(s) per day', (frequency, expected) => {
    expect(dosesPerDayFromFrequency(frequency)).toBe(expected);
  });

  it('calculates the physical units needed for the complete prescription line', () => {
    expect(
      computeUnitsToDispenseForLine({
        quantity: 1,
        frequency: '1-0-1',
        duration: 5,
      }),
    ).toBe(10);
    expect(
      unitsForBillLine({
        quantity: 1,
        frequency: 'TDS',
        duration: 2,
      }),
    ).toBe(6);
  });

  it('rejects unrecognized text instead of silently treating it as once daily', () => {
    expect(() => dosesPerDayFromFrequency('when needed maybe')).toThrow(
      'Unsupported prescription frequency',
    );
  });
});
