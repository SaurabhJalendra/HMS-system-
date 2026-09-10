import {
  computeUnitsToDispenseForLine,
  dosesPerDayFromFrequency,
} from '../../utils/prescriptionDispenseUnits';

describe('prescription dispense units', () => {
  it.each([
    ['1-0-1', 2],
    ['OD', 1],
    ['BD', 2],
    ['TDS', 3],
    ['QID', 4],
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
  });
});
