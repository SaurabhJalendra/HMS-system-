import React, { useState } from 'react';

export type CustomAllergyEntry = {
  name: string;
  cause: string;
  category: string;
};

export type CustomConditionEntry = {
  name: string;
  category: string;
};

type Props =
  | {
      kind: 'allergy';
      onClose: () => void;
      onSave: (entries: CustomAllergyEntry[]) => Promise<void>;
    }
  | {
      kind: 'condition';
      onClose: () => void;
      onSave: (entries: CustomConditionEntry[]) => Promise<void>;
    };

const ALLERGY_TYPES = ['Food', 'Drug', 'Environmental', 'Chemical', 'Biological'];
const CONDITION_TYPES = [
  'Cardiovascular',
  'Endocrine',
  'Respiratory',
  'Gastrointestinal',
  'Neurological',
  'Musculoskeletal',
  'Renal',
  'Mental health',
  'Oncology',
  'Other',
];

const fieldClass =
  'mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

const CustomCatalogEntryModal: React.FC<Props> = (props) => {
  const isAllergy = props.kind === 'allergy';
  const [entries, setEntries] = useState<Array<CustomAllergyEntry | CustomConditionEntry>>([
    isAllergy
      ? { name: '', cause: '', category: ALLERGY_TYPES[0] }
      : { name: '', category: CONDITION_TYPES[0] },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateEntry = (index: number, field: string, value: string) => {
    setEntries((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    );
  };

  const addEntry = () => {
    setEntries((current) => [
      ...current,
      isAllergy
        ? { name: '', cause: '', category: ALLERGY_TYPES[0] }
        : { name: '', category: CONDITION_TYPES[0] },
    ]);
  };

  const removeEntry = (index: number) => {
    setEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
  };

  const handleSave = async () => {
    setError('');
    const normalized = entries.map((entry) => ({
      ...entry,
      name: entry.name.trim(),
      category: entry.category.trim(),
      ...('cause' in entry ? { cause: entry.cause.trim() } : {}),
    }));
    if (normalized.some((entry) => !entry.name || !entry.category)) {
      setError(`Enter the ${isAllergy ? 'allergy' : 'disease'} name and type for every row.`);
      return;
    }
    if (isAllergy && normalized.some((entry) => !('cause' in entry) || !entry.cause)) {
      setError('Enter the cause of allergy for every row.');
      return;
    }

    setSaving(true);
    try {
      if (props.kind === 'allergy') {
        await props.onSave(normalized as CustomAllergyEntry[]);
      } else {
        await props.onSave(normalized as CustomConditionEntry[]);
      }
      props.onClose();
    } catch (err: unknown) {
      const requestError = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      setError(
        requestError.response?.data?.message ||
          requestError.message ||
          'Could not save the catalog entries.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isAllergy ? 'Add other allergies' : 'Add other chronic conditions'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) props.onClose();
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '85vh',
          overflowY: 'auto',
          backgroundColor: '#FFFFFF',
          borderRadius: 8,
          border: '1px solid #D1D5DB',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {isAllergy ? 'Add other allergies' : 'Add other chronic conditions'}
            </h2>
            <p style={{ margin: '6px 0 0', color: '#6B7280', fontSize: 13 }}>
              Add as many entries as needed. Saved entries will remain in this catalog.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={saving}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          {entries.map((entry, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: isAllergy ? '1fr 1fr 180px auto' : '1fr 220px auto',
                gap: 10,
                alignItems: 'end',
                padding: 12,
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 6,
              }}
            >
              <label style={{ fontSize: 13, fontWeight: 500 }}>
                {isAllergy ? 'Allergy name' : 'Disease name'} *
                <input
                  type="text"
                  value={entry.name}
                  onChange={(event) => updateEntry(index, 'name', event.target.value)}
                  className={fieldClass}
                  maxLength={120}
                />
              </label>
              {isAllergy && (
                <label style={{ fontSize: 13, fontWeight: 500 }}>
                  Cause of allergy *
                  <input
                    type="text"
                    value={'cause' in entry ? entry.cause : ''}
                    onChange={(event) => updateEntry(index, 'cause', event.target.value)}
                    className={fieldClass}
                    maxLength={500}
                  />
                </label>
              )}
              <label style={{ fontSize: 13, fontWeight: 500 }}>
                Type of {isAllergy ? 'allergy' : 'disease'} *
                <select
                  value={entry.category}
                  onChange={(event) => updateEntry(index, 'category', event.target.value)}
                  className={fieldClass}
                >
                  {(isAllergy ? ALLERGY_TYPES : CONDITION_TYPES).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => removeEntry(index)}
                disabled={entries.length === 1 || saving}
                style={{
                  padding: '8px 10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: 5,
                  backgroundColor: '#FFFFFF',
                  cursor: entries.length === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" style={{ color: '#B91C1C', fontSize: 13, margin: '12px 0 0' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 18 }}>
          <button
            type="button"
            onClick={addEntry}
            disabled={saving}
            style={{
              padding: '9px 14px',
              border: '1px solid #2563EB',
              borderRadius: 5,
              color: '#2563EB',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            + Add another
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={props.onClose}
              disabled={saving}
              style={{
                padding: '9px 14px',
                border: '1px solid #D1D5DB',
                borderRadius: 5,
                backgroundColor: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                padding: '9px 16px',
                border: 'none',
                borderRadius: 5,
                backgroundColor: saving ? '#9CA3AF' : '#059669',
                color: '#FFFFFF',
                cursor: saving ? 'wait' : 'pointer',
                fontWeight: 500,
              }}
            >
              {saving ? 'Saving…' : `Save ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomCatalogEntryModal;
