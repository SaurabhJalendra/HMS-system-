import React, { useEffect, useState } from 'react';
import prescriptionService from '../../lib/api/services/prescriptionService';
import catalogService from '../../lib/api/services/catalogService';
import LoadingSpinner from '../common/LoadingSpinner';
import MedicineSearchSelect from '../patientJourney/doctor/MedicineSearchSelect';
import { useCriticalUpdateLock } from '../../lib/hooks/useCriticalUpdateLock';

interface EditLine {
  medicineId: string;
  medicineName: string;
  quantity: number;
  frequency: string;
  duration: number;
  instructions: string;
  dosage: string;
  withFood: string;
}

interface PrescriptionEditModalProps {
  prescriptionId: string;
  onClose: () => void;
  onSaved: () => void;
}

const emptyLine = (): EditLine => ({
  medicineId: '',
  medicineName: '',
  quantity: 1,
  frequency: '1-0-1',
  duration: 5,
  instructions: '',
  dosage: '',
  withFood: '',
});

const WITH_FOOD_OPTIONS = ['', 'With meal', 'Before meal', 'After meal', 'Empty stomach', 'Bedtime'];

const PrescriptionEditModal: React.FC<PrescriptionEditModalProps> = ({
  prescriptionId,
  onClose,
  onSaved,
}) => {
  useCriticalUpdateLock(true, 'prescription-edit');

  const [medicines, setMedicines] = useState<
    Array<{ id: string; name: string; code?: string; genericName?: string }>
  >([]);
  const [lines, setLines] = useState<EditLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [header, setHeader] = useState({
    prescriptionNumber: '',
    patientName: '',
    doctorName: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [rxResponse, catalog] = await Promise.all([
          prescriptionService.getPrescriptionById(prescriptionId),
          catalogService.getAllMedicines(),
        ]);
        if (cancelled) return;

        const prescription: any = rxResponse.prescription;
        const catalogMedicines = (catalog?.medicines || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          code: m.code,
          genericName: m.genericName,
        }));
        setMedicines(catalogMedicines);
        setHeader({
          prescriptionNumber: prescription.prescriptionNumber || '',
          patientName: prescription.patient?.name || 'Patient',
          doctorName: prescription.doctor?.fullName || '',
        });
        setNotes(prescription.notes || '');

        const items = prescription.prescriptionItems || prescription.items || [];
        if (items.length === 0) {
          setLines([emptyLine()]);
        } else {
          setLines(
            items.map((item: any) => ({
              medicineId: item.medicineId || item.medicine?.id || '',
              medicineName: item.medicine?.name || item.medicineName || '',
              quantity: Number(item.quantity) || 1,
              frequency: item.frequency || '1-0-1',
              duration: Number(item.duration) || 1,
              instructions: item.instructions || '',
              dosage: item.dosage || '',
              withFood: item.withFood || '',
            })),
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load prescription');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [prescriptionId]);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const updateLine = (index: number, field: keyof EditLine, value: string | number) => {
    setLines((prev) => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      return next;
    });
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = lines.filter((line) => line.medicineId && line.quantity > 0 && line.duration > 0 && line.frequency.trim());
    if (valid.length === 0) {
      setError('Add at least one medicine with quantity, frequency, and duration.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await prescriptionService.updatePrescription(prescriptionId, {
        notes: notes.trim() || undefined,
        items: valid.map((line) => ({
          medicineId: line.medicineId,
          quantity: line.quantity,
          frequency: String(line.frequency),
          duration: Number(line.duration),
          instructions: line.instructions || undefined,
          dosage: line.dosage || undefined,
          withFood: line.withFood || undefined,
        })),
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update prescription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit prescription</h2>
            <p className="text-sm text-gray-600 mt-1">
              {header.prescriptionNumber ? `${header.prescriptionNumber} · ` : ''}
              {header.patientName}
              {header.doctorName ? ` · ${header.doctorName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {error && <p className="text-red-600 text-sm">{error}</p>}

            {lines.map((line, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
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
                  disabled={saving}
                />
                <div className="flex flex-wrap gap-2 items-end">
                  <label className="text-sm text-gray-700">
                    Qty
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', parseInt(e.target.value, 10) || 1)}
                      className="mt-1 block w-16 px-2 py-1 border border-gray-300 rounded-md text-sm"
                      disabled={saving}
                    />
                  </label>
                  <label className="text-sm text-gray-700">
                    Frequency
                    <input
                      value={line.frequency}
                      onChange={(e) => updateLine(index, 'frequency', e.target.value)}
                      placeholder="1-0-1"
                      className="mt-1 block w-28 px-2 py-1 border border-gray-300 rounded-md text-sm"
                      disabled={saving}
                    />
                  </label>
                  <label className="text-sm text-gray-700">
                    Days
                    <input
                      type="number"
                      min={1}
                      value={line.duration}
                      onChange={(e) => updateLine(index, 'duration', parseInt(e.target.value, 10) || 1)}
                      className="mt-1 block w-16 px-2 py-1 border border-gray-300 rounded-md text-sm"
                      disabled={saving}
                    />
                  </label>
                  <label className="text-sm text-gray-700">
                    With food
                    <select
                      value={line.withFood}
                      onChange={(e) => updateLine(index, 'withFood', e.target.value)}
                      className="mt-1 block w-40 px-2 py-1 border border-gray-300 rounded-md text-sm"
                      disabled={saving}
                    >
                      {WITH_FOOD_OPTIONS.map((option) => (
                        <option key={option || 'none'} value={option}>
                          {option || 'Not specified'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-red-600 text-sm px-2 py-1"
                      disabled={saving}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  value={line.dosage}
                  onChange={(e) => updateLine(index, 'dosage', e.target.value)}
                  placeholder="Dosage (e.g. 500mg)"
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                  disabled={saving}
                />
                <input
                  value={line.instructions}
                  onChange={(e) => updateLine(index, 'instructions', e.target.value)}
                  placeholder="Instructions (optional)"
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                  disabled={saving}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addLine}
              disabled={saving}
              className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
            >
              + Add medicine
            </button>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                disabled={saving}
              />
            </div>

            {saving && <LoadingSpinner />}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`px-6 py-2 text-white rounded-lg ${saving ? 'bg-gray-400' : 'bg-teal-600 hover:bg-teal-700'}`}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PrescriptionEditModal;
