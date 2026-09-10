import React, { useEffect, useState } from 'react';
import prescriptionService from '../../lib/api/services/prescriptionService';
import LoadingSpinner from '../common/LoadingSpinner';

interface PrescriptionInventoryAuditProps {
  prescriptionId: string;
  onClose: () => void;
}

const PrescriptionInventoryAudit: React.FC<PrescriptionInventoryAuditProps> = ({
  prescriptionId,
  onClose,
}) => {
  const [audit, setAudit] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    prescriptionService
      .getInventoryAudit(prescriptionId)
      .then((result) => {
        if (!cancelled) setAudit(result);
      })
      .catch((requestError: any) => {
        if (!cancelled) {
          setError(
            requestError?.response?.data?.message ||
              requestError?.message ||
              'Failed to check medicine inventory',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [prescriptionId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Medicine Stock Audit</h2>
            {audit && (
              <p className="text-sm text-gray-600 mt-1">
                {audit.prescriptionNumber} · {audit.patient?.name}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">{error}</div>
        ) : !audit ? (
          <LoadingSpinner />
        ) : (
          <>
            <div
              className={`mb-4 p-4 rounded border ${
                audit.canDispense
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {audit.canDispense
                ? 'All prescribed medicines are available in sufficient quantity.'
                : 'This prescription cannot be fully dispensed. Review the shortages below.'}
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Medicine', 'Dose plan', 'Required', 'In stock', 'Result'].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {audit.items.map((item: any) => (
                    <tr key={item.prescriptionItemId}>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{item.medicineName}</div>
                        <div className="text-gray-500">{item.medicineCode}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.quantityPerDose} × {item.frequency} × {item.duration} days
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{item.requiredUnits}</td>
                      <td className="px-4 py-3 text-sm font-medium">{item.availableUnits}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            item.isAvailable
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.isAvailable
                            ? 'Available'
                            : `Short by ${item.shortageUnits}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end mt-5">
          <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionInventoryAudit;
