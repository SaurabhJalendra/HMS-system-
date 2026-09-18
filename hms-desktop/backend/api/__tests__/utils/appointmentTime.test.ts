import {
  dayBoundsInTimeZone,
  nowInTimeZone,
  parseSlotMinutes,
  toYmd,
} from '../../utils/appointmentTime';

describe('appointmentTime', () => {
  it('builds UTC bounds for an Asia/Kolkata clinic day', () => {
    const bounds = dayBoundsInTimeZone('2026-09-17', 'Asia/Kolkata');
    expect(bounds.start.toISOString()).toBe('2026-09-16T18:30:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-09-17T18:30:00.000Z');
  });

  describe('parseSlotMinutes', () => {
    it('parses 24-hour slots', () => {
      expect(parseSlotMinutes('09:30')).toBe(570);
      expect(parseSlotMinutes('10:00')).toBe(600);
      expect(parseSlotMinutes('17:00')).toBe(1020);
      expect(parseSlotMinutes('10:00:00')).toBe(600);
    });

    it('parses 12-hour slots', () => {
      expect(parseSlotMinutes('12:00 AM')).toBe(0);
      expect(parseSlotMinutes('12:00 PM')).toBe(720);
      expect(parseSlotMinutes('1:05 pm')).toBe(785);
    });

    it('rejects values that are not a time', () => {
      expect(parseSlotMinutes('nonsense')).toBeNull();
      expect(parseSlotMinutes('25:00')).toBeNull();
      expect(parseSlotMinutes('10:75')).toBeNull();
      expect(parseSlotMinutes('')).toBeNull();
    });
  });

  describe('nowInTimeZone', () => {
    it('reports the calendar day and minute of the requested zone', () => {
      const ist = nowInTimeZone('Asia/Kolkata');
      expect(ist.ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ist.minutes).toBeGreaterThanOrEqual(0);
      expect(ist.minutes).toBeLessThan(1440);
    });

    it('separates zones by their real offset', () => {
      const ist = nowInTimeZone('Asia/Kolkata');
      const utc = nowInTimeZone('UTC');
      // Asia/Kolkata is UTC+05:30, so 330 minutes ahead across the day boundary
      expect((ist.minutes - utc.minutes + 1440) % 1440).toBe(330);
    });
  });

  describe('toYmd', () => {
    it('keeps the calendar day without shifting to UTC', () => {
      expect(toYmd('2026-09-16')).toBe('2026-09-16');
      expect(toYmd('2026-09-16T23:30:00')).toBe('2026-09-16');
    });

    it('returns an empty string for unparseable input', () => {
      expect(toYmd('garbage')).toBe('');
    });
  });
});
