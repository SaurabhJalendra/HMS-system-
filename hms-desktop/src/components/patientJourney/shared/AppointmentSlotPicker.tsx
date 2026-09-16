import React, { useState, useEffect } from 'react';
import appointmentService from '../../../lib/api/services/appointmentService';
import type { User } from '../../../types';
import { toLocalYmd } from '../../../lib/utils/localDate';

interface AppointmentSlotPickerProps {
  patientId: string | null;
  onSelect: (payload: { doctorId: string; date: string; time: string }) => void;
  doctors?: User[];
  initialDoctorId?: string;
  initialDate?: string;
  initialTime?: string;
  submitLabel?: string;
  requirePatient?: boolean;
}

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
];

/** Minutes past midnight for an "HH:MM" slot. */
const slotToMinutes = (slot: string): number => {
  const [hours, minutes] = slot.split(':').map((part) => parseInt(part, 10));
  return hours * 60 + minutes;
};

/** Minutes past midnight on the local clock, which is the clinic's clock. */
const minutesNow = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

const AppointmentSlotPicker: React.FC<AppointmentSlotPickerProps> = ({
  patientId,
  onSelect,
  doctors: doctorsProp,
  initialDoctorId = '',
  initialDate = '',
  initialTime = '',
  submitLabel = 'Schedule appointment',
  requirePatient = true,
}) => {
  const [doctors, setDoctors] = useState<User[]>(doctorsProp || []);
  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctorId);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (doctorsProp?.length) return;
    let cancelled = false;
    setLoading(true);
    appointmentService.getAvailableDoctors().then((list) => {
      if (!cancelled) setDoctors(list || []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doctorsProp]);

  useEffect(() => {
    if (initialDoctorId) setSelectedDoctorId(initialDoctorId);
    if (initialDate) setDate(initialDate);
    if (initialTime) setTime(initialTime);
  }, [initialDoctorId, initialDate, initialTime]);

  const today = toLocalYmd();
  // Read on every render so an open form never works from a stale clock
  const nowMinutes = minutesNow();

  /** A slot has passed only when it falls on today. Later days stay fully open. */
  const isPastSlot = (slot: string): boolean =>
    !!date && date === today && slotToMinutes(slot) < nowMinutes;

  // Switching the date to today can invalidate an already-picked time
  useEffect(() => {
    if (date && date === toLocalYmd() && time && slotToMinutes(time) < minutesNow()) {
      setTime('');
    }
  }, [date, time]);

  const allSlotsPassedToday = date === today && TIME_SLOTS.every(isPastSlot);
  const patientMissing = requirePatient && !patientId;
  const canSubmit =
    !patientMissing && !!selectedDoctorId && !!date && !!time && !isPastSlot(time);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      onSelect({ doctorId: selectedDoctorId, date, time });
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {patientMissing && (
        <p style={{ color: '#B45309', fontSize: 14 }}>Complete Step 1 (select or register patient) first.</p>
      )}
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Doctor</label>
        <select
          value={selectedDoctorId}
          onChange={(e) => setSelectedDoctorId(e.target.value)}
          required
          disabled={loading}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: 14,
          }}
        >
          <option value="">Select doctor</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.fullName}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Date</label>
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: 14,
          }}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Time</label>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: 14,
          }}
        >
          <option value="">Select time</option>
          {TIME_SLOTS.map((t) => {
            const passed = isPastSlot(t);
            return (
              <option key={t} value={t} disabled={passed}>
                {passed ? `${t} — already passed` : t}
              </option>
            );
          })}
        </select>
        {allSlotsPassedToday && (
          <p style={{ marginTop: 4, color: '#B45309', fontSize: 13 }}>
            All of today&apos;s slots have passed. Choose a later date.
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          padding: '10px 16px',
          backgroundColor: canSubmit ? '#2563EB' : '#9CA3AF',
          color: '#FFF',
          border: 'none',
          borderRadius: '6px',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          fontWeight: 500,
        }}
      >
        {submitLabel}
      </button>
    </form>
  );
};

export default AppointmentSlotPicker;
