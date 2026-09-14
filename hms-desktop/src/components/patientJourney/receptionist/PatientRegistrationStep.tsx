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

  useEffect(() => {
    setMode(initialMode);
    setSelected(null);
  }, [initialMode]);

  const handleSelect = (patient: Patient) => {
    setSelected(patient);
  };

  const handleUseSelected = () => {
    if (selected) onPatientReady(selected);
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setMode('search'); setSelected(null); }}
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

      {mode === 'search' && (
        <>
          <PatientSearch onSelect={handleSelect} />
          {selected && (
            <div style={{ marginTop: 16 }}>
              <p style={{ marginBottom: 8, fontSize: 14 }}>Selected:</p>
              <PatientCard patient={selected} />
              <button
                type="button"
                onClick={handleUseSelected}
                style={{
                  marginTop: 12,
                  padding: '10px 16px',
                  backgroundColor: '#059669',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Use this patient → Continue to Step 2
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'new' && (
        <PatientRegistrationForm onSuccess={onPatientReady} />
      )}
    </div>
  );
};

export default PatientRegistrationStep;
