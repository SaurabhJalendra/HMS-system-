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

/** Letters and spaces only (patient name). Keeps a trailing space so the next word can be typed. */
export function lettersAndSpacesOnly(value: string, maxLength = 100): string {
  return value.replace(/[^A-Za-z\s]/g, '').replace(/\s+/g, ' ').slice(0, maxLength);
}

/** Letters and digits only (passport). */
export function alphanumericOnly(value: string, maxLength = 20): string {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, maxLength);
}

/** Letters, digits, and spaces (address). */
export function alphanumericAndSpaces(value: string, maxLength = 500): string {
  return value.replace(/[^A-Za-z0-9\s]/g, '').slice(0, maxLength);
}

export function isLettersAndSpacesName(value: string): boolean {
  return /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(value.trim());
}

export function isAlphanumeric(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value);
}

export function isAlphanumericAndSpaces(value: string): boolean {
  return /^(?=.*[A-Za-z0-9])[A-Za-z0-9 ]+$/.test(value.trim());
}

export function isTenDigitPhone(value: string): boolean {
  return /^[0-9]{10}$/.test(value);
}

export function isTwelveDigitAadhar(value: string): boolean {
  return /^[0-9]{12}$/.test(value);
}

export function bloodGroupSelectValue(stored?: string | null): BloodGroupOption | '' {
  if (!stored) return '';
  if ((BLOOD_GROUP_OPTIONS as readonly string[]).includes(stored)) {
    return stored as BloodGroupOption;
  }
  return 'Other';
}
