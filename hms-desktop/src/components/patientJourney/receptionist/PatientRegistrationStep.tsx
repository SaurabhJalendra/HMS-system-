import React, { useState, useEffect } from 'react';
import type { Patient } from '../../../lib/api/types';
import PatientSearch from '../shared/PatientSearch';
import PatientCard from '../shared/PatientCard';
import PatientRegistrationForm from '../../patients/PatientRegistrationForm';

interface PatientRegistrationStepProps {
  onPatientReady: (patient: Patient) => void;
  initialMode?: 'search' | 'new';
}

const PatientRegistrationStep: React.FC<PatientRegistrationStepProps> = ({
  onPatientReady,
  initialMode = 'search',
}) => {
  const [mode, setMode] = useState<'search' | 'new'>(initialMode);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [searchKey, setSearchKey] = useState(0);

  useEffect(() => {
    setMode(initialMode);
    setSelected(null);
  }, [initialMode]);

  const handleSelect = (patient: Patient) => {
    setSelected(patient);
  };

  const handleBookAppointment = () => {
    if (selected) onPatientReady(selected);
  };

  const handleBackToSearch = () => {
    setSelected(null);
    setSearchKey((key) => key + 1);
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => {
            setMode('search');
            handleBackToSearch();
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: mode === 'search' ? '#2563EB' : '#F3F4F6',
            color: mode === 'search' ? '#FFF' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Search existing
        </button>
        <button
          type="button"
          onClick={() => { setMode('new'); setSelected(null); }}
          style={{
            padding: '8px 16px',
            backgroundColor: mode === 'new' ? '#2563EB' : '#F3F4F6',
            color: mode === 'new' ? '#FFF' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          New patient
        </button>
      </div>

      {mode === 'search' && !selected && (
        <PatientSearch key={searchKey} onSelect={handleSelect} />
      )}

      {mode === 'search' && selected && (
        <div style={{ marginTop: 8 }}>
          <p style={{ marginBottom: 8, fontSize: 14 }}>Selected:</p>
          <PatientCard patient={selected} />
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              type="button"
              onClick={handleBookAppointment}
              style={{
                padding: '10px 16px',
                backgroundColor: '#059669',
                color: '#FFF',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Book Appointment
            </button>
            <button
              type="button"
              onClick={handleBackToSearch}
              style={{
                padding: '10px 16px',
                backgroundColor: '#F3F4F6',
                color: '#374151',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Back to search
            </button>
          </div>
        </div>
      )}

      {mode === 'new' && (
        <PatientRegistrationForm onSuccess={onPatientReady} />
      )}
    </div>
  );
};

export default PatientRegistrationStep;
