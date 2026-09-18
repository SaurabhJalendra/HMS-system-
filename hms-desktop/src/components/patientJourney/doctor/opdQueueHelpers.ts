import type { Appointment } from '../../../lib/api/types';

/** Row action for doctor OPD queue (from appointment list + relations). */
export type OpdQueueRowKind = 'start' | 'held' | 'prescription' | 'completed';

export function getOpdQueueRowKind(apt: Appointment): OpdQueueRowKind {
  const hasConsultation = (apt.consultations?.length ?? 0) > 0;
  const hasPrescription = (apt.prescriptions ?? []).some(
    (prescription) => prescription.status !== 'CANCELLED',
  );
  if (!hasConsultation) return 'start';
  if (hasPrescription) return 'completed';
  const heldUntil = apt.consultations?.[0]?.heldUntil;
  if (heldUntil) return 'held';
  return 'prescription';
}

export function getOpdQueueRowLabel(kind: OpdQueueRowKind): string {
  switch (kind) {
    case 'start':
      return 'Start consultation →';
    case 'held':
      return 'Resume (held — lab) →';
    case 'prescription':
      return 'Continue → prescription';
    case 'completed':
      return 'Completed ✓';
    default:
      return 'Open →';
  }
}
