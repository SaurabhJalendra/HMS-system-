import { describe, expect, it } from 'vitest';
import { buildAppointmentSlots } from '../../components/patientJourney/shared/AppointmentSlotPicker';

describe('appointment slot generation', () => {
  it('uses configured working hours and slot duration', () => {
    expect(buildAppointmentSlots('10:00', '12:00', 20)).toEqual([
      '10:00',
      '10:20',
      '10:40',
      '11:00',
      '11:20',
      '11:40',
    ]);
  });

  it('returns no slots for invalid or reversed hours', () => {
    expect(buildAppointmentSlots('17:00', '09:00', 30)).toEqual([]);
  });
});
