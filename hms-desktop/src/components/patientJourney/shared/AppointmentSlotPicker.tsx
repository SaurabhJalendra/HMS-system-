import React, { useState, useEffect } from 'react';
import appointmentService from '../../../lib/api/services/appointmentService';
import type { User } from '../../../types';
import { useHospitalConfig } from '../../../lib/contexts/HospitalConfigContext';

interface AppointmentSlotPickerProps {
  patientId: string | null;
  onSelect: (payload: { doctorId: string; date: string; time: string }) => void;
  doctors?: User[];
  initialDoctorId?: string;
  initialDate?: string;
  initialTime?: string;
  submitLabel?: string;
  requirePatient?: boolean;
  submitting?: boolean;
}

/** Minutes past midnight for an "HH:MM" slot. */
const slotToMinutes = (slot: string): number => {
  const [hours, minutes] = slot.split(':').map((part) => parseInt(part, 10));
  return hours * 60 + minutes;
};

function clinicNow(timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function minutesToSlot(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function buildAppointmentSlots(startTime: string, endTime: string, duration: number): string[] {
  const start = slotToMinutes(startTime);
  const end = slotToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [];
  const safeDuration = Math.min(240, Math.max(5, duration || 30));
  const slots: string[] = [];
  for (let minute = start; minute < end; minute += safeDuration) {
    slots.push(minutesToSlot(minute));
  }
  return slots;
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
  submitting = false,
}) => {
  const { config, timezone } = useHospitalConfig();
  const [doctors, setDoctors] = useState<User[]>(doctorsProp || []);
  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctorId);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [loading, setLoading] = useState(false);
  const [doctorError, setDoctorError] = useState('');
  const [doctorRetryKey, setDoctorRetryKey] = useState(0);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityRetryKey, setAvailabilityRetryKey] = useState(0);
  const [bookedTimes, setBookedTimes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (doctorsProp?.length) return;
    let cancelled = false;
    setLoading(true);
    setDoctorError('');
    appointmentService
      .getAvailableDoctors()
      .then((list) => {
        if (!cancelled) setDoctors(list || []);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setDoctors([]);
        setDoctorError(
          (requestError as { response?: { data?: { message?: string } }; message?: string })
            ?.response?.data?.message ||
            (requestError as { message?: string })?.message ||
            'Could not load available doctors.',
        );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [doctorRetryKey, doctorsProp]);

  useEffect(() => {
    if (initialDoctorId) setSelectedDoctorId(initialDoctorId);
    if (initialDate) setDate(initialDate);
    if (initialTime) setTime(initialTime);
  }, [initialDoctorId, initialDate, initialTime]);

  const hours = config?.workingHours || {};
  const startTime = hours.startTime || '09:00';
  const endTime = hours.endTime || '17:00';
  const slotDuration = Number(config?.appointmentSlotDuration) || 30;
  const timeSlots = React.useMemo(
    () => buildAppointmentSlots(startTime, endTime, slotDuration),
    [endTime, slotDuration, startTime],
  );
  const now = clinicNow(timezone || 'Asia/Kolkata');
  const today = now.date;
  const workingDays: string[] = Array.isArray(hours.workingDays)
    ? hours.workingDays
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectedDay = date
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
        new Date(`${date}T12:00:00Z`).getUTCDay()
      ]
    : '';
  const isClosedDay = Boolean(date && !workingDays.includes(selectedDay));

  /** A slot has passed only when it falls on today. Later days stay fully open. */
  const isPastSlot = (slot: string): boolean =>
    !!date && date === today && slotToMinutes(slot) <= now.minutes;

  // Switching the date to today can invalidate an already-picked time
  useEffect(() => {
    const current = clinicNow(timezone || 'Asia/Kolkata');
    if (date && date === current.date && time && slotToMinutes(time) <= current.minutes) {
      setTime('');
    }
  }, [date, time, timezone]);

  useEffect(() => {
    if (!selectedDoctorId || !date) {
      setBookedTimes(new Set());
      setAvailabilityError('');
      return;
    }
    let cancelled = false;
    setLoadingAvailability(true);
    setAvailabilityError('');
    appointmentService
      .getAppointments({ doctorId: selectedDoctorId, date, page: 1, limit: 100 })
      .then(({ appointments }) => {
        if (cancelled) return;
        setBookedTimes(
          new Set(
            (appointments || [])
              .filter((appointment) => !['CANCELLED', 'NO_SHOW'].includes(appointment.status))
              .map((appointment) => appointment.time),
          ),
        );
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setBookedTimes(new Set());
        setAvailabilityError(
          (requestError as { response?: { data?: { message?: string } }; message?: string })
            ?.response?.data?.message ||
            (requestError as { message?: string })?.message ||
            'Could not load booked slots.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingAvailability(false);
      });
    return () => {
      cancelled = true;
    };
  }, [availabilityRetryKey, date, selectedDoctorId]);

  const allSlotsPassedToday = date === today && timeSlots.every(isPastSlot);
  const patientMissing = requirePatient && !patientId;
  const canSubmit =
    !patientMissing &&
    !!selectedDoctorId &&
    !!date &&
    !!time &&
    !isPastSlot(time) &&
    !bookedTimes.has(time) &&
    !isClosedDay &&
    !loadingAvailability &&
    !availabilityError &&
    !submitting;

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
        {doctorError && (
          <div role="alert" style={{ marginTop: 4, color: '#DC2626', fontSize: 13 }}>
            {doctorError}{' '}
            <button type="button" onClick={() => setDoctorRetryKey((key) => key + 1)}>
              Retry
            </button>
          </div>
        )}
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
        {isClosedDay && (
          <p style={{ marginTop: 4, color: '#B45309', fontSize: 13 }}>
            The clinic is closed on {selectedDay}. Choose a configured working day.
          </p>
        )}
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
          {timeSlots.map((t) => {
            const passed = isPastSlot(t);
            const booked = bookedTimes.has(t);
            return (
              <option key={t} value={t} disabled={passed || booked}>
                {passed ? `${t} — already passed` : booked ? `${t} — booked` : t}
              </option>
            );
          })}
        </select>
        <p style={{ marginTop: 4, color: '#6B7280', fontSize: 12 }}>
          Clinic hours: {startTime}–{endTime} · {slotDuration}-minute slots · {timezone}
        </p>
        {loadingAvailability && <p style={{ marginTop: 4, fontSize: 13 }}>Checking availability…</p>}
        {availabilityError && (
          <p role="alert" style={{ marginTop: 4, color: '#DC2626', fontSize: 13 }}>
            {availabilityError}{' '}
            <button type="button" onClick={() => setAvailabilityRetryKey((key) => key + 1)}>
              Retry
            </button>
          </p>
        )}
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
        {submitting ? 'Scheduling…' : submitLabel}
      </button>
    </form>
  );
};

export default AppointmentSlotPicker;
