import React, { useState, useEffect, useCallback } from 'react';
import patientService from '../../lib/api/services/patientService';
import catalogService from '../../lib/api/services/catalogService';
import type { Allergy, ChronicCondition } from '../../lib/api/services/catalogService';
import type { Patient } from '../../lib/api/types';
import type { CreatePatientRequest } from '../../lib/api/types';
import { Gender } from '../../lib/api/types';
import LoadingSpinner from '../common/LoadingSpinner';
import { useCriticalUpdateLock } from '../../lib/hooks/useCriticalUpdateLock';

export type PatientRegistrationFormData = {
  name: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string;
  nationality: 'IN' | 'FOREIGN';
  aadharCardNumber: string;
  passportNumber: string;
  address: string;
  bloodGroup: string;
  allergies: string;
  chronicConditions: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  referredBy: string;
};

export const getInitialPatientRegistrationFormData = (): PatientRegistrationFormData => ({
  name: '',
  dateOfBirth: '',
  gender: Gender.MALE,
  phone: '',
  nationality: 'IN',
  aadharCardNumber: '',
  passportNumber: '',
  address: '',
  bloodGroup: '',
  allergies: '',
  chronicConditions: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  referredBy: '',
});

interface PatientRegistrationFormProps {
  onSuccess: (patient: Patient) => void;
  submitLabel?: string;
}

/**
 * Full patient registration (same fields and API sequence as the former Patients module add form).
 * Used from OPD Flow; new patients are not created from Patient Management.
 */
const PatientRegistrationForm: React.FC<PatientRegistrationFormProps> = ({
  onSuccess,
  submitLabel = 'Register patient → Continue to Step 2',
}) => {
  useCriticalUpdateLock(true, 'patient-registration');
  const [formData, setFormData] = useState<PatientRegistrationFormData>(getInitialPatientRegistrationFormData);
  const [allergyCatalog, setAllergyCatalog] = useState<Allergy[]>([]);
  const [conditionCatalog, setConditionCatalog] = useState<ChronicCondition[]>([]);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [conditionSearchTerm, setConditionSearchTerm] = useState('');
  const [allergySearchTerm, setAllergySearchTerm] = useState('');
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allergies, conditions] = await Promise.all([
          catalogService.getAllAllergies(),
          catalogService.getAllChronicConditions(),
        ]);
        if (!cancelled) {
          setAllergyCatalog(allergies.allergies || []);
          setConditionCatalog(conditions.conditions || []);
        }
      } catch (err) {
        console.error('Load catalog error:', err);
      } finally {
        if (!cancelled) setCatalogsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const toggleAllergy = useCallback((allergyId: string, event?: React.MouseEvent | React.ChangeEvent) => {
    if (event && 'stopPropagation' in event) event.stopPropagation();
    setSelectedAllergies((prev) =>
      prev.includes(allergyId) ? prev.filter((id) => id !== allergyId) : [...prev, allergyId]
    );
  }, []);

  const toggleCondition = useCallback((conditionId: string, event?: React.MouseEvent | React.ChangeEvent) => {
    if (event && 'stopPropagation' in event) event.stopPropagation();
    setSelectedConditions((prev) =>
      prev.includes(conditionId) ? prev.filter((id) => id !== conditionId) : [...prev, conditionId]
    );
  }, []);

  const filteredConditions = conditionCatalog.filter(
    (condition) =>
      condition.name.toLowerCase().includes(conditionSearchTerm.toLowerCase()) ||
      condition.category.toLowerCase().includes(conditionSearchTerm.toLowerCase()) ||
      (condition.description && condition.description.toLowerCase().includes(conditionSearchTerm.toLowerCase()))
  );

  const filteredAllergies = allergyCatalog.filter(
    (allergy) =>
      allergy.name.toLowerCase().includes(allergySearchTerm.toLowerCase()) ||
      allergy.category.toLowerCase().includes(allergySearchTerm.toLowerCase()) ||
      (allergy.description && allergy.description.toLowerCase().includes(allergySearchTerm.toLowerCase()))
  );

  const getSelectedConditionNames = () =>
    selectedConditions
      .map((id) => conditionCatalog.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => c!.name);

  const getSelectedAllergyNames = () =>
    selectedAllergies
      .map((id) => allergyCatalog.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => a!.name);

  const handleNationalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'IN' | 'FOREIGN';
    setFormData((prev) => ({
      ...prev,
      nationality: value,
      ...(value === 'IN' ? { passportNumber: '' } : { aadharCardNumber: '' }),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const { nationality, ...rest } = formData;
      void nationality;
      const patientData: CreatePatientRequest = { ...rest };

      const created = await patientService.createPatient(patientData);

      for (const conditionId of selectedConditions) {
        try {
          await catalogService.addPatientChronicCondition(created.id, {
            conditionId,
            diagnosisDate: new Date().toISOString().split('T')[0],
            currentStatus: 'Active',
            notes: '',
          });
        } catch (conditionError) {
          console.warn('Failed to add condition:', conditionError);
        }
      }

      for (const allergyId of selectedAllergies) {
        try {
          await catalogService.addPatientAllergy(created.id, {
            allergyId,
            severity: 'Unknown',
            notes: '',
          });
        } catch (allergyError) {
          console.warn('Failed to add allergy:', allergyError);
        }
      }

      setFormData(getInitialPatientRegistrationFormData());
      setSelectedConditions([]);
      setSelectedAllergies([]);
      setConditionSearchTerm('');
      setAllergySearchTerm('');
      onSuccess(created);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create patient');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (catalogsLoading) {
    return <LoadingSpinner />;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl"
    >
      {error && <p className="md:col-span-2 text-red-600 text-sm">{error}</p>}

      <div>
        <label className="block text-sm font-medium text-gray-700">Name *</label>
        <input
          type="text"
          name="name"
          required
          value={formData.name}
          onChange={handleInputChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Date of Birth *</label>
        <input
          type="date"
          name="dateOfBirth"
          required
          max={new Date().toISOString().split('T')[0]}
          value={formData.dateOfBirth}
          onChange={handleInputChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Gender *</label>
        <select
          name="gender"
          required
          value={formData.gender}
          onChange={handleInputChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Phone *</label>
        <input
          type="tel"
          name="phone"
          required
          value={formData.phone}
          onChange={handleInputChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Nationality</label>
        <select
          name="nationality"
          value={formData.nationality}
          onChange={handleNationalityChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="IN">Indian (Aadhar)</option>
          <option value="FOREIGN">Foreign (Passport)</option>
        </select>
      </div>

      {formData.nationality === 'IN' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700">Aadhar Card Number</label>
          <input
            type="text"
            name="aadharCardNumber"
            value={formData.aadharCardNumber}
            onChange={handleInputChange}
            placeholder="Enter 12-digit Aadhar number"
            maxLength={12}
            pattern="[0-9]{12}"
            title="Aadhar card number must be exactly 12 digits"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Unique 12-digit identity number (optional but recommended for Indian patients)
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700">Passport Number</label>
          <input
            type="text"
            name="passportNumber"
            value={formData.passportNumber}
            onChange={handleInputChange}
            placeholder="Enter passport number (e.g. A1234567)"
            maxLength={20}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">Passport number for foreign patients (optional)</p>
        </div>
      )}

      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700">Address *</label>
        <textarea
          name="address"
          required
          rows={2}
          value={formData.address}
          onChange={handleInputChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Blood Group</label>
        <input
          type="text"
          name="bloodGroup"
          value={formData.bloodGroup}
          onChange={handleInputChange}
          placeholder="e.g., O+, A-, B+"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-2">Allergies (from catalog)</label>
        <div className="mb-2">
          <input
            type="text"
            placeholder="Search allergies..."
            value={allergySearchTerm}
            onChange={(e) => setAllergySearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div
          className="max-h-[200px] overflow-y-auto border border-gray-300 rounded p-3 bg-white"
        >
          {filteredAllergies.length === 0 ? (
            <div className="p-2 text-gray-500 text-center text-sm">
              {allergySearchTerm ? 'No allergies found matching your search.' : 'No allergies in catalog.'}
            </div>
          ) : (
            filteredAllergies.map((allergy) => (
              <div
                key={allergy.id}
                className={`flex items-center gap-2 mb-2 p-1.5 rounded cursor-pointer ${
                  selectedAllergies.includes(allergy.id) ? 'bg-blue-100' : ''
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName !== 'INPUT') toggleAllergy(allergy.id, e);
                }}
              >
                <input
                  type="checkbox"
                  id={`reg-allergy-${allergy.id}`}
                  checked={selectedAllergies.includes(allergy.id)}
                  onChange={(e) => toggleAllergy(allergy.id, e)}
                  className="cursor-pointer"
                />
                <label
                  htmlFor={`reg-allergy-${allergy.id}`}
                  title={allergy.description || undefined}
                  className="cursor-pointer flex-1 text-sm"
                >
                  {allergy.name}
                  <span className="text-gray-500 text-xs ml-2">({allergy.category})</span>
                </label>
              </div>
            ))
          )}
        </div>
        {selectedAllergies.length > 0 && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-sm text-gray-800">
            <span className="font-medium">{selectedAllergies.length} selected: </span>
            {getSelectedAllergyNames().join(', ')}
          </div>
        )}
      </div>

      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Medical history (past diseases / chronic conditions)
        </label>
        <div className="mb-2">
          <input
            type="text"
            placeholder="Search diseases/conditions..."
            value={conditionSearchTerm}
            onChange={(e) => setConditionSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto border border-gray-300 rounded p-3 bg-white">
          {filteredConditions.length === 0 ? (
            <div className="p-2 text-gray-500 text-center text-sm">
              {conditionSearchTerm ? 'No conditions found matching your search.' : 'No conditions in catalog.'}
            </div>
          ) : (
            filteredConditions.map((condition) => (
              <div
                key={condition.id}
                className={`flex items-center gap-2 mb-2 p-1.5 rounded cursor-pointer ${
                  selectedConditions.includes(condition.id) ? 'bg-blue-100' : ''
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName !== 'INPUT') toggleCondition(condition.id, e);
                }}
              >
                <input
                  type="checkbox"
                  id={`reg-condition-${condition.id}`}
                  checked={selectedConditions.includes(condition.id)}
                  onChange={(e) => toggleCondition(condition.id, e)}
                  className="cursor-pointer"
                />
                <label
                  htmlFor={`reg-condition-${condition.id}`}
                  title={condition.description || undefined}
                  className="cursor-pointer flex-1 text-sm"
                >
                  {condition.name}
                  <span className="text-gray-500 text-xs ml-2">({condition.category})</span>
                </label>
              </div>
            ))
          )}
        </div>
        {selectedConditions.length > 0 && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-sm text-gray-800">
            <span className="font-medium">{selectedConditions.length} selected: </span>
            {getSelectedConditionNames().join(', ')}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Emergency contact name</label>
        <input
          type="text"
          name="emergencyContactName"
          value={formData.emergencyContactName}
          onChange={handleInputChange}
          placeholder="Emergency contact name"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Emergency contact phone</label>
        <input
          type="tel"
          name="emergencyContactPhone"
          value={formData.emergencyContactPhone}
          onChange={handleInputChange}
          placeholder="Emergency contact phone"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700">Referred by</label>
        <p className="text-xs text-gray-500 mt-0.5 mb-1">
          Optional — name of the doctor, staff member, or other person who referred this patient.
        </p>
        <input
          type="text"
          name="referredBy"
          value={formData.referredBy}
          onChange={handleInputChange}
          placeholder="e.g. Dr. Meera Singh"
          maxLength={200}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400"
        >
          {isSubmitting ? 'Creating…' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default PatientRegistrationForm;
