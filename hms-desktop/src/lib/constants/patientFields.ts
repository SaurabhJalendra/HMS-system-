export const BLOOD_GROUP_OPTIONS = [
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
] as const;

export type BloodGroupOption = (typeof BLOOD_GROUP_OPTIONS)[number];

export function digitsOnly(value: string, maxLength: number): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

export function isTenDigitPhone(value: string): boolean {
  return /^[0-9]{10}$/.test(value);
}

export function bloodGroupSelectValue(stored?: string | null): BloodGroupOption | '' {
  if (!stored) return '';
  if ((BLOOD_GROUP_OPTIONS as readonly string[]).includes(stored)) {
    return stored as BloodGroupOption;
  }
  return 'Other';
}
