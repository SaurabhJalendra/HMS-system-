import React, { useState, useEffect } from 'react';
import prescriptionService from '../../../lib/api/services/prescriptionService';
import catalogService from '../../../lib/api/services/catalogService';
import type { Appointment } from '../../../lib/api/types';
import LoadingSpinner from '../../common/LoadingSpinner';
import MedicineSearchSelect from './MedicineSearchSelect';
import { useCriticalUpdateLock } from '../../../lib/hooks/useCriticalUpdateLock';

interface PrescriptionLine {
  medicineId: string;
  medicineName: string;
  quantity: number;
  frequency: string;
  duration: number;
  instructions: string;
  dosage: string;
}

interface PrescriptionWriterProps {
  appointment: Appointment;
  consultationId: string | null;
  doctorId: string;
  onDone: () => void;
  onBack: () => void;
}

const PrescriptionWriter: React.FC<PrescriptionWriterProps> = ({
  appointment,
  consultationId,
  doctorId,
  onDone,
  onBack,
}) => {
  useCriticalUpdateLock(true, 'prescription');
  const [medicines, setMedicines] = useState<
    Array<{ id: string; name: string; code?: string; genericName?: string }>
  >([]);
  const [lines, setLines] = useState<PrescriptionLine[]>([
    { medicineId: '', medicineName: '', quantity: 1, frequency: '1-0-1', duration: 5, instructions: '', dosage: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [error, setError] = useState('');

  const patientId = appointment.patientId || (appointment as any).patient?.id;

  useEffect(() => {
    let cancelled = false;
    catalogService
      .getAllMedicines()
      .then((data: any) => {
        if (!cancelled && data?.medicines) {
          setMedicines(
            data.medicines.map((m: any) => ({
              id: m.id,
              name: m.name,
              code: m.code,
              genericName: m.genericName,
            })),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMedicines(false);
      });
    return () => { cancelled = true; };
  }, []);

  const addLine = () => {
    setLines((prev) => [...prev, { medicineId: '', medicineName: '', quantity: 1, frequency: '1-0-1', duration: 5, instructions: '', dosage: '' }]);
  };

  const updateLine = (index: number, field: keyof PrescriptionLine, value: string | number) => {
    setLines((prev) => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      if (field === 'medicineId') {
        const m = medicines.find((x) => x.id === value);
        if (m) next[index].medicineName = m.name;
      }
      return next;
    });
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = lines.filter((l) => l.medicineId && l.quantity > 0 && l.duration > 0);
    if (valid.length === 0) {
      setError('Add at least one medicine with quantity and duration.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        patientId,
        doctorId,
        appointmentId: appointment.id,
        consultationId: consultationId || undefined,
        notes: notes.trim() || undefined,
        items: valid.map((l) => ({
          medicineId: l.medicineId,
          quantity: l.quantity,
          frequency: String(l.frequency),
          duration: Number(l.duration),
          instructions: l.instructions || undefined,
          dosage: l.dosage || undefined,
        })),
      };
      await prescriptionService.createPrescription(payload);
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create prescription');
    } finally {
      setLoading(false);
    }
  };

  if (loadingMedicines) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ marginBottom: 12, fontSize: 14 }}>
        Prescription for <strong>{(appointment as any).patient?.name ?? 'Patient'}</strong>
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <p style={{ color: '#DC2626', fontSize: 14 }}>{error}</p>}
        {lines.map((line, index) => (
          <div key={index} style={{ padding: 12, border: '1px solid #E5E7EB', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MedicineSearchSelect
              medicines={medicines}
              valueId={line.medicineId}
              onChange={(medicineId, medicineName) => {
                setLines((prev) => {
                  const next = [...prev];
                  next[index] = { ...next[index], medicineId, medicineName };
                  return next;
                });
              }}
              disabled={loading}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => updateLine(index, 'quantity', parseInt(e.target.value, 10) || 1)}
                placeholder="Qty"
                style={{ width: 60, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
              />
              <input
                value={line.frequency}
                onChange={(e) => updateLine(index, 'frequency', e.target.value)}
                placeholder="Frequency (e.g. 1-0-1)"
                style={{ width: 100, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
              />
              <input
                type="number"
                min={1}
                value={line.duration}
                onChange={(e) => updateLine(index, 'duration', parseInt(e.target.value, 10) || 1)}
                placeholder="Days"
                style={{ width: 60, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
              />
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(index)} style={{ padding: '6px 10px', color: '#DC2626', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>Remove</button>
              )}
            </div>
            <input
              value={line.dosage}
              onChange={(e) => updateLine(index, 'dosage', e.target.value)}
              placeholder="Dosage (e.g. 500mg)"
              style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
            />
            <input
              value={line.instructions}
              onChange={(e) => updateLine(index, 'instructions', e.target.value)}
              placeholder="Instructions (optional)"
              style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
            />
          </div>
        ))}
        <button type="button" onClick={addLine} style={{ padding: '8px 12px', border: '1px dashed #D1D5DB', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#F9FAFB', fontSize: 14 }}>
          + Add medicine
        </button>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }} />
        </div>
        {loading && <LoadingSpinner />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onBack} style={{ padding: '10px 16px', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#FFF' }}>Back</button>
          <button type="submit" disabled={loading} style={{ padding: '10px 16px', backgroundColor: loading ? '#9CA3AF' : '#059669', color: '#FFF', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
            Save prescription & finish
          </button>
        </div>
      </form>
    </div>
  );
};

export default PrescriptionWriter;
