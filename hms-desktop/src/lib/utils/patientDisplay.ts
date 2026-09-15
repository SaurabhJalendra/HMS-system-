/**
 * Display ID for patients: patient.id is the human-readable id (name_last4 format).
 */
export function getDisplayPatientId(patient: { id?: string } | null | undefined): string {
  if (!patient) return 'N/A';
  return (patient.id ?? 'N/A').trim() || 'N/A';
}

/** Billing / search option label: "Patient Name(phone)". */
export function formatPatientNamePhone(
  patient: { name?: string | null; phone?: string | null } | null | undefined,
): string {
  if (!patient) return '';
  const name = (patient.name || '').trim() || 'Unknown';
  const phone = (patient.phone || '').trim();
  return phone ? `${name}(${phone})` : name;
}
