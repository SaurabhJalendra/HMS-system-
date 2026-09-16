import { getHospitalConfig } from './hospitalHelper';

/**
 * Appointment slots are wall-clock values ("2026-09-16" + "10:00") with no offset,
 * so "is this slot in the past" only means something in the clinic's own time zone.
 * We read that zone from HospitalConfig and fall back to the server zone.
 */
function resolveClinicTimeZone(configured?: string | null): string {
  const zone = (configured || '').trim();
  if (!zone) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return zone;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
}

/** Current calendar day (YYYY-MM-DD) and minutes past midnight in `timeZone`. */
export function nowInTimeZone(timeZone: string): { ymd: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
  // en-CA renders midnight as "24" in some runtimes; normalise it to 0.
  const hour = parseInt(pick('hour'), 10) % 24;
  const minute = parseInt(pick('minute'), 10);

  return {
    ymd: `${pick('year')}-${pick('month')}-${pick('day')}`,
    minutes: hour * 60 + minute,
  };
}

/** "10:00", "10:00:00" or "10:00 AM" -> minutes past midnight. Null when unparseable. */
export function parseSlotMinutes(time: string): number | null {
  const raw = String(time || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toLowerCase();

  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

/** Calendar day of an appointment date value, without UTC day-shift. */
export function toYmd(date: string | Date): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date.trim())) {
    return date.trim().slice(0, 10);
  }
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Reject slots that have already passed. A time is only rejected on the current
 * day; the same time tomorrow is always allowed.
 *
 * @returns an error message, or null when the slot is bookable.
 */
export async function findPastSlotError(
  date: string | Date,
  time: string
): Promise<string | null> {
  const ymd = toYmd(date);
  if (!ymd) return 'Appointment date is invalid.';

  const slotMinutes = parseSlotMinutes(time);
  if (slotMinutes === null) return 'Appointment time is invalid.';

  const config = await getHospitalConfig();
  const timeZone = resolveClinicTimeZone(config?.timezone);
  const now = nowInTimeZone(timeZone);

  if (ymd < now.ymd) {
    return 'Appointments cannot be booked for a past date.';
  }
  if (ymd === now.ymd && slotMinutes < now.minutes) {
    return 'That time has already passed today. Pick a later slot today, or the same time on a following day.';
  }

  return null;
}
