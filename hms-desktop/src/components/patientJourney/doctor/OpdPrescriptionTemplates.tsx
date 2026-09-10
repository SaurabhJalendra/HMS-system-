import React, { useEffect, useState } from 'react';
import prescriptionService from '../../../lib/api/services/prescriptionService';
import LoadingSpinner from '../../common/LoadingSpinner';

interface TemplateLine {
  medicineId: string;
  medicineName: string;
  quantity: number;
  frequency: string;
  duration: number;
  instructions: string;
  dosage: string;
}

interface OpdPrescriptionTemplatesProps {
  currentLines: TemplateLine[];
  onApply: (lines: TemplateLine[]) => void;
  onClose: () => void;
}

const OpdPrescriptionTemplates: React.FC<OpdPrescriptionTemplatesProps> = ({
  currentLines,
  onApply,
  onClose,
}) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const result = await prescriptionService.getTemplates();
      setTemplates(result.templates || []);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const saveCurrentPrescription = async () => {
    const validLines = currentLines.filter(
      (line) => line.medicineId && line.quantity > 0 && line.duration > 0,
    );
    if (!name.trim()) {
      setError('Enter a template name.');
      return;
    }
    if (validLines.length === 0) {
      setError('Add at least one medicine before saving a template.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await prescriptionService.createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        templateData: validLines.map((line) => ({
          medicineId: line.medicineId,
          quantity: line.quantity,
          frequency: line.frequency,
          duration: line.duration,
          instructions: line.instructions || undefined,
          dosage: line.dosage || undefined,
        })),
      });
      setName('');
      setDescription('');
      await loadTemplates();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (template: any) => {
    const lines = (template.templateData || []).map((line: any) => ({
      medicineId: line.medicineId,
      medicineName: '',
      quantity: Number(line.quantity) || 1,
      frequency: line.frequency || '1-0-1',
      duration: Number(line.duration) || 1,
      instructions: line.instructions || '',
      dosage: line.dosage || '',
    }));
    if (lines.length > 0) {
      onApply(lines);
      onClose();
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!window.confirm('Delete this prescription template?')) return;
    try {
      await prescriptionService.deleteTemplate(id);
      setTemplates((current) => current.filter((template) => template.id !== id));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Failed to delete template');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Prescription Templates</h2>
            <p className="text-sm text-gray-600 mt-1">
              Apply a saved template or save the medicines currently entered below.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800">{error}</div>}

        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg mb-5">
          <h3 className="font-semibold text-gray-900 mb-3">Save current medicines as a template</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Template name"
              maxLength={100}
              className="px-3 py-2 border border-gray-300 rounded"
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              maxLength={500}
              className="px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <button
            type="button"
            onClick={saveCurrentPrescription}
            disabled={saving}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving…' : 'Save current prescription'}
          </button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : templates.length === 0 ? (
          <p className="text-center py-6 text-gray-500">No saved templates yet.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    {template.description && <p className="text-sm text-gray-600 mt-1">{template.description}</p>}
                    <p className="text-xs text-gray-500 mt-2">
                      {(template.templateData || []).length} medicine(s)
                    </p>
                  </div>
                  <div className="flex gap-2 items-start">
                    <button
                      type="button"
                      onClick={() => applyTemplate(template)}
                      className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >
                      Use template
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(template.id)}
                      className="px-3 py-2 text-red-700 border border-red-200 rounded hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OpdPrescriptionTemplates;
