/**
 * Shared rules for how many physical units a prescription line represents.
 * Keep in sync with backend/api/utils/prescriptionDispenseUnits.ts.
 */

export function parseDosesPerDayFromFrequency(frequency: string): number | null {
  const raw = (frequency || '').trim();
  if (!raw) return null;

  const compact = raw.replace(/\s/g, '');
  if (/^\d+(-\d+)+$/.test(compact)) {
    const sum = compact
      .split('-')
      .map(Number)
      .reduce((total, doses) => total + doses, 0);
    return sum > 0 && sum <= 24 ? sum : null;
  }

  const upper = compact.toUpperCase();
  const abbrev: Record<string, number> = {
    OD: 1,
    ODS: 1,
    BD: 2,
    BID: 2,
    TDS: 3,
    TID: 3,
    QID: 4,
    QDS: 4,
  };
  if (abbrev[upper] !== undefined) return abbrev[upper];

  const words = raw.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  const wordAliases: Record<string, number> = {
    daily: 1,
    'once daily': 1,
    'once a day': 1,
    'twice daily': 2,
    'twice a day': 2,
    'thrice daily': 3,
    'three times daily': 3,
    'three times a day': 3,
    'four times daily': 4,
    'four times a day': 4,
  };
  if (wordAliases[words]) return wordAliases[words];

  const timesPerDay = words.match(/^(\d{1,2})\s*(?:times?|x)\s*(?:a|per)?\s*day$/);
  if (timesPerDay) {
    const doses = Number(timesPerDay[1]);
    return doses > 0 && doses <= 24 ? doses : null;
  }

  const everyHours = words.match(/^every\s+(\d{1,2})\s*(?:hours?|hrs?)$/);
  if (everyHours) {
    const interval = Number(everyHours[1]);
    return interval > 0 && interval <= 24 && 24 % interval === 0
      ? 24 / interval
      : null;
  }

  return null;
}

export function isSupportedPrescriptionFrequency(frequency: string): boolean {
  return parseDosesPerDayFromFrequency(frequency) !== null;
}

export function dosesPerDayFromFrequency(frequency: string): number {
  const doses = parseDosesPerDayFromFrequency(frequency);
  if (doses === null) {
    throw new RangeError(`Unsupported prescription frequency: ${frequency}`);
  }
  return doses;
}

export function computeUnitsToDispenseForLine(item: {
  quantity: number;
  frequency: string;
  duration: number;
}): number {
  const perDose = Math.max(1, item.quantity);
  const days = Math.max(1, item.duration);
  return perDose * dosesPerDayFromFrequency(item.frequency) * days;
}

export function unitsForBillLine(item: {
  quantity?: number | null;
  frequency?: string | null;
  duration?: number | null;
}): number {
  const quantity = Number(item.quantity ?? 1);
  const duration = Number(item.duration ?? 1);
  const frequency = String(item.frequency || '').trim();
  if (!frequency) return Math.max(1, quantity);
  try {
    return computeUnitsToDispenseForLine({ quantity, frequency, duration });
  } catch {
    return Math.max(1, quantity);
  }
}
