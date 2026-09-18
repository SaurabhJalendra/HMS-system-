import React, { useCallback, useEffect, useRef, useState } from 'react';
import prescriptionService from '../../../lib/api/services/prescriptionService';
import catalogService from '../../../lib/api/services/catalogService';
import type { Appointment } from '../../../lib/api/types';
import LoadingSpinner from '../../common/LoadingSpinner';
import MedicineSearchSelect from './MedicineSearchSelect';
import OpdPrescriptionTemplates from './OpdPrescriptionTemplates';
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

const DEFAULT_FREQUENCY = '1-0-1';
const FREQUENCY_OPTIONS = [
  { value: 'OD', label: 'OD — once daily' },
  { value: 'BD', label: 'BD — twice daily' },
  { value: 'TDS', label: 'TDS — three times daily' },
  { value: 'QID', label: 'QID — four times daily' },
  { value: '1-0-0', label: '1-0-0 — morning' },
  { value: '0-1-0', label: '0-1-0 — afternoon' },
  { value: '0-0-1', label: '0-0-1 — evening' },
  { value: DEFAULT_FREQUENCY, label: '1-0-1 — morning and evening' },
];

const createEmptyLine = (): PrescriptionLine => ({
  medicineId: '',
  medicineName: '',
  quantity: 1,
  frequency: DEFAULT_FREQUENCY,
  duration: 5,
  instructions: '',
  dosage: '',
});

const PrescriptionWriter: React.FC<PrescriptionWriterProps> = ({
  appointment,
  consultationId,
  doctorId,
  onDone,
  onBack,
}) => {
  useCriticalUpdateLock(true, 'prescription');
  const [medicines, setMedicines] = useState<
    Array<{
      id: string;
      name: string;
      code?: string;
      genericName?: string;
      packDisplay?: string;
      stockQuantity?: number;
      tabletsPerStrip?: number | null;
      stockStatus?: 'OK' | 'LOW';
    }>
  >([]);
  const [lines, setLines] = useState<PrescriptionLine[]>([createEmptyLine()]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const submittingRef = useRef(false);

  const patientId = appointment.patientId || (appointment as any).patient?.id;

  const loadMedicines = useCallback(async (isCancelled?: () => boolean) => {
    setLoadingMedicines(true);
    setCatalogError('');
    try {
      const data = await catalogService.getAllMedicines();
      if (isCancelled?.()) return;
      setMedicines(
        (data?.medicines || [])
          .filter((medicine) => medicine.isActive !== false)
          .map((medicine) => ({
            id: medicine.id,
            name: medicine.name,
            code: medicine.code,
            genericName: medicine.genericName,
            packDisplay: medicine.packDisplay,
            stockQuantity: medicine.stockQuantity,
            tabletsPerStrip: medicine.tabletsPerStrip,
            stockStatus: medicine.stockStatus,
          })),
      );
    } catch (requestError: any) {
      if (isCancelled?.()) return;
      setMedicines([]);
      setCatalogError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          'Failed to load the medicine catalog.',
      );
    } finally {
      if (!isCancelled?.()) setLoadingMedicines(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadMedicines(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadMedicines]);

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
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

  const applyTemplate = (templateLines: PrescriptionLine[]) => {
    setLines(
      templateLines.map((line) => ({
        ...line,
        medicineName:
          medicines.find((medicine) => medicine.id === line.medicineId)?.name ||
          line.medicineName,
      })),
    );
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!patientId) {
      setError('Patient information is missing. Return to the patient queue and try again.');
      return;
    }
    const unsupportedFrequencyLines = lines
      .map((line, index) =>
        FREQUENCY_OPTIONS.some((option) => option.value === line.frequency)
          ? null
          : index + 1,
      )
      .filter((lineNumber): lineNumber is number => lineNumber !== null);
    if (unsupportedFrequencyLines.length > 0) {
      setError(
        `Choose a supported frequency for medicine line${unsupportedFrequencyLines.length > 1 ? 's' : ''} ${unsupportedFrequencyLines.join(', ')}.`,
      );
      return;
    }
    const incompleteLineNumbers = lines
      .map((line, index) =>
        !line.medicineId ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        !line.frequency.trim() ||
        !Number.isFinite(line.duration) ||
        line.duration <= 0
          ? index + 1
          : null,
      )
      .filter((lineNumber): lineNumber is number => lineNumber !== null);
    if (incompleteLineNumbers.length > 0) {
      setError(
        `Complete medicine line${incompleteLineNumbers.length > 1 ? 's' : ''} ${incompleteLineNumbers.join(', ')} before saving.`,
      );
      return;
    }
    const selectedMedicineIds = lines.map((line) => line.medicineId);
    if (new Set(selectedMedicineIds).size !== selectedMedicineIds.length) {
      setError('Each medicine can only be added once. Remove the duplicate medicine.');
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        patientId,
        doctorId,
        appointmentId: appointment.id,
        consultationId: consultationId || undefined,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({
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
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (loadingMedicines && medicines.length === 0) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          Prescription for <strong>{(appointment as any).patient?.name ?? 'Patient'}</strong>
        </p>
        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          style={{ padding: '8px 12px', color: '#1D4ED8', border: '1px solid #93C5FD', borderRadius: '6px', backgroundColor: '#EFF6FF', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
        >
          Prescription templates
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {catalogError && (
          <div role="alert" style={{ color: '#991B1B', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: 10, fontSize: 14 }}>
            <span>{catalogError}</span>{' '}
            <button type="button" onClick={() => void loadMedicines()} disabled={loadingMedicines}>
              {loadingMedicines ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        {error && <p role="alert" style={{ color: '#DC2626', fontSize: 14 }}>{error}</p>}
        {lines.map((line, index) => (
          <div key={index} style={{ padding: 12, border: '1px solid #E5E7EB', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 13, color: '#374151' }}>
              Medicine {index + 1} of {lines.length}
            </strong>
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
                Units per dose
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, 'quantity', Number(e.target.value))}
                  style={{ width: 70, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
                Frequency
                <select
                  value={line.frequency}
                  onChange={(e) => updateLine(index, 'frequency', e.target.value)}
                  style={{ width: 210, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
                >
                  {!FREQUENCY_OPTIONS.some((option) => option.value === line.frequency) && (
                    <option value={line.frequency} disabled>
                      {line.frequency} — unsupported saved value; choose a frequency
                    </option>
                  )}
                  {FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
                Days
                <input
                  type="number"
                  min={1}
                  value={line.duration}
                  onChange={(e) => updateLine(index, 'duration', Number(e.target.value))}
                  style={{ width: 70, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
                />
              </label>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(index)} style={{ padding: '6px 10px', color: '#DC2626', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>Remove</button>
              )}
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
              Dosage
              <input
                value={line.dosage}
                onChange={(e) => updateLine(index, 'dosage', e.target.value)}
                placeholder="e.g. 500mg"
                style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: 14 }}
              />
            </label>
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
      {showTemplates && (
        <OpdPrescriptionTemplates
          currentLines={lines}
          onApply={applyTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
};

export default PrescriptionWriter;
