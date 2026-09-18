import React from 'react';
import type { Patient } from '../../../lib/api/types';
import type { Appointment } from '../../../lib/api/types';
import PatientCard from '../shared/PatientCard';
import { toLocalYmd } from '../../../lib/utils/localDate';

interface QueueConfirmationProps {
  patient: Patient;
  appointment: Appointment;
  onStartOver: () => void;
}

const QueueConfirmation: React.FC<QueueConfirmationProps> = ({ patient, appointment, onStartOver }) => {
  const doctorName = (appointment as any).doctor?.fullName ?? 'Doctor';
  const appointmentDay = toLocalYmd(appointment.date);
  const isToday = appointmentDay === toLocalYmd();

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: 20, backgroundColor: '#ECFDF5', border: '1px solid #10B981', borderRadius: '8px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#065F46' }}>
          ✅ {isToday ? 'Patient queued' : 'Appointment confirmed'}
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: '#047857' }}>
          Patient is registered and the appointment is scheduled
          {isToday ? ' in today’s doctor queue.' : ` for ${appointmentDay}.`}
        </p>
      </div>
      <p style={{ marginBottom: 8, fontSize: 14, fontWeight: 500 }}>Patient</p>
      <PatientCard patient={patient} />
      <div style={{ marginTop: 16, padding: 12, backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500 }}>Appointment</p>
        <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
          {appointmentDay} at {appointment.time} with {doctorName}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>Status: {appointment.status}</p>
      </div>
      <button
        type="button"
        onClick={onStartOver}
        style={{
          marginTop: 20,
          padding: '10px 16px',
          backgroundColor: '#2563EB',
          color: '#FFF',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Register another patient
      </button>
    </div>
  );
};

export default QueueConfirmation;
