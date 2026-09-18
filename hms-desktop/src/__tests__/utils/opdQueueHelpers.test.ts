import { describe, expect, it } from 'vitest';
import type { Appointment } from '../../lib/api/types';
import { getOpdQueueRowKind } from '../../components/patientJourney/doctor/opdQueueHelpers';

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appointment-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    date: '2026-09-17',
    time: '10:00',
    status: 'IN_PROGRESS',
    createdAt: '2026-09-17T04:30:00.000Z',
    updatedAt: '2026-09-17T04:30:00.000Z',
    ...overrides,
  } as Appointment;
}

describe('OPD queue classification', () => {
  it('does not treat a cancelled prescription as a completed visit', () => {
    expect(
      getOpdQueueRowKind(
        appointment({
          consultations: [{ id: 'consultation-1' }] as Appointment['consultations'],
          prescriptions: [{ id: 'prescription-1', status: 'CANCELLED' }] as Appointment['prescriptions'],
        }),
      ),
    ).toBe('prescription');
  });

  it('treats a non-cancelled prescription as completed', () => {
    expect(
      getOpdQueueRowKind(
        appointment({
          consultations: [{ id: 'consultation-1' }] as Appointment['consultations'],
          prescriptions: [{ id: 'prescription-1', status: 'ACTIVE' }] as Appointment['prescriptions'],
        }),
      ),
    ).toBe('completed');
  });
});
