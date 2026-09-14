import React, { useState, useEffect } from 'react';
import appointmentService from '../../../lib/api/services/appointmentService';
import type { Appointment } from '../../../lib/api/types';
import LoadingSpinner from '../../common/LoadingSpinner';
import { getOpdQueueRowKind, getOpdQueueRowLabel, type OpdQueueRowKind } from './opdQueueHelpers';
import { toLocalYmd } from '../../../lib/utils/localDate';

interface TodaysQueueProps {
  currentUserId: string;
  /** Override doctor filter (e.g. admin opening another doctor's visit). */
  doctorId?: string;
  /** YYYY-MM-DD; defaults to today. */
  queueDate?: string;
  focusAppointmentId?: string;
  /** Called with how this row should open in OPD (consultation vs prescription vs summary). */
  onSelectAppointment: (appointment: Appointment, kind: OpdQueueRowKind) => void;
  /** Increment to refetch after completing a prescription, etc. */
  refreshKey?: number;
}

const TodaysQueue: React.FC<TodaysQueueProps> = ({
  currentUserId,
  doctorId,
  queueDate,
  focusAppointmentId,
  onSelectAppointment,
  refreshKey = 0,
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const resolvedDate = queueDate || toLocalYmd();
  const resolvedDoctorId = doctorId || currentUserId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    appointmentService
      .getAppointments({ doctorId: resolvedDoctorId, date: resolvedDate, limit: 100 })
      .then((data) => {
        if (!cancelled) setAppointments(data?.appointments || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedDoctorId, resolvedDate, refreshKey]);

  const byStatus = (a: Appointment, b: Appointment) => {
    const order = ['IN_PROGRESS', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
    return order.indexOf(a.status) - order.indexOf(b.status);
  };
  const sorted = [...appointments].sort(byStatus);

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>
        Queue for {resolvedDate === toLocalYmd() ? 'today' : resolvedDate}
      </h3>
      {sorted.length === 0 ? (
        <p style={{ color: '#6B7280', fontSize: 14 }}>No appointments for {resolvedDate === toLocalYmd() ? 'today' : resolvedDate}.</p>
      ) : (
        sorted.map((apt) => {
          const kind = getOpdQueueRowKind(apt);
          const label = getOpdQueueRowLabel(kind);
          const isDone = kind === 'completed';
          const isHeld = kind === 'held';
          const heldUntil = apt.consultations?.[0]?.heldUntil;
          return (
            <div
              key={apt.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                border: `2px solid ${
                  apt.id === focusAppointmentId ? '#2563EB' : isHeld ? '#FCD34D' : '#E5E7EB'
                }`,
                borderRadius: '8px',
                backgroundColor:
                  apt.id === focusAppointmentId
                    ? '#EFF6FF'
                    : isDone
                      ? '#F9FAFB'
                      : isHeld
                        ? '#FFFBEB'
                        : '#FFF',
                cursor: 'pointer',
              }}
              onClick={() => onSelectAppointment(apt, kind)}
              onKeyDown={(e) => e.key === 'Enter' && onSelectAppointment(apt, kind)}
              role="button"
              tabIndex={0}
            >
              <div>
                <span style={{ fontWeight: 600 }}>{(apt as any).patient?.name ?? 'Patient'}</span>
                <span style={{ marginLeft: 8, color: '#6B7280', fontSize: 14 }}>
                  {apt.time} · {apt.status}
                  {heldUntil && (
                    <span style={{ display: 'block', fontSize: 12, color: '#B45309', marginTop: 2 }}>
                      Hold until: {new Date(heldUntil).toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
              <span
                style={{
                  color: isDone ? '#059669' : isHeld ? '#D97706' : '#2563EB',
                  fontSize: 14,
                  fontWeight: isDone || isHeld ? 600 : 400,
                }}
              >
                {label}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
};

export default TodaysQueue;
