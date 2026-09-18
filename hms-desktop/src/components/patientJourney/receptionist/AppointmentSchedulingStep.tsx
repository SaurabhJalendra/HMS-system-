import React from 'react';
import type { Patient } from '../../../lib/api/types';
import type { Appointment } from '../../../lib/api/types';
import PatientCard from '../shared/PatientCard';
import AppointmentSlotPicker from '../shared/AppointmentSlotPicker';

interface AppointmentSchedulingStepProps {
  patient: Patient | null;
  onScheduled: (appointment: Appointment) => void;
  onBack: () => void;
}

const AppointmentSchedulingStep: React.FC<AppointmentSchedulingStepProps> = ({ patient, onScheduled, onBack }) => {
  const [creating, setCreating] = React.useState(false);
  const [err, setErr] = React.useState('');
  const creatingRef = React.useRef(false);

  const handleSelect = async (payload: { doctorId: string; date: string; time: string }) => {
    if (!patient || creatingRef.current) return;
    creatingRef.current = true;
    setErr('');
    setCreating(true);
    try {
      const appointmentService = (await import('../../../lib/api/services/appointmentService')).default;
      const appointment = await appointmentService.createAppointment({
        patientId: patient.id,
        doctorId: payload.doctorId,
        date: payload.date,
        time: payload.time,
      });
      onScheduled(appointment);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to create appointment');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      {patient ? (
        <>
          <p style={{ marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Patient for this appointment</p>
          <div style={{ marginBottom: 16 }}><PatientCard patient={patient} /></div>
        </>
      ) : (
        <p style={{ color: '#B45309', marginBottom: 16 }}>Complete Step 1 to select or register a patient.</p>
      )}
      {err && <p style={{ color: '#DC2626', fontSize: 14, marginBottom: 8 }}>{err}</p>}
      <AppointmentSlotPicker
        patientId={patient?.id ?? null}
        onSelect={handleSelect}
        submitting={creating}
      />
      <button
        type="button"
        onClick={onBack}
        disabled={creating}
        style={{ marginTop: 12, padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 6, backgroundColor: '#FFF', cursor: creating ? 'not-allowed' : 'pointer' }}
      >
        ← Change patient
      </button>
      {creating && <p style={{ marginTop: 12, fontSize: 14, color: '#6B7280' }}>Scheduling…</p>}
    </div>
  );
};

export default AppointmentSchedulingStep;
