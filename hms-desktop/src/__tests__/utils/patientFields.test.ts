import { describe, it, expect } from 'vitest';
import {
  BLOOD_GROUP_OPTIONS,
  bloodGroupSelectValue,
  digitsOnly,
  isTenDigitPhone,
} from '../../lib/constants/patientFields';

describe('patientFields', () => {
  it('includes the standard blood groups plus N.A and Other', () => {
    expect(BLOOD_GROUP_OPTIONS).toEqual([
      'A+',
      'B+',
      'AB+',
      'O+',
      'A-',
      'B-',
      'AB-',
      'O-',
      'N.A',
      'Other',
    ]);
  });

  it('keeps only digits up to the max length', () => {
    expect(digitsOnly('98ab76-543210 extra', 10)).toBe('9876543210');
    expect(digitsOnly('12', 3)).toBe('12');
  });

  it('accepts only an exact 10-digit phone', () => {
    expect(isTenDigitPhone('9876543210')).toBe(true);
    expect(isTenDigitPhone('987654321')).toBe(false);
    expect(isTenDigitPhone('98765432101')).toBe(false);
    expect(isTenDigitPhone('98765-43210')).toBe(false);
  });

  it('maps stored blood groups onto the dropdown', () => {
    expect(bloodGroupSelectValue('A+')).toBe('A+');
    expect(bloodGroupSelectValue('N.A')).toBe('N.A');
    expect(bloodGroupSelectValue('Bombay')).toBe('Other');
    expect(bloodGroupSelectValue('')).toBe('');
  });
});
