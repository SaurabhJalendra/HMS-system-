import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface MedicineOption {
  id: string;
  name: string;
  code?: string;
  genericName?: string;
}

function formatMedicine(m: MedicineOption): string {
  const code = m.code ? ` (${m.code})` : '';
  return `${m.name}${code}`;
}

interface MedicineSearchSelectProps {
  medicines: MedicineOption[];
  valueId: string;
  onChange: (medicineId: string, medicineName: string) => void;
  disabled?: boolean;
}

/**
 * Searchable medicine picker for OPD prescription lines — filters full catalog client-side
 * (API returns all medicines via GET /catalog/medicines).
 */
const MedicineSearchSelect: React.FC<MedicineSearchSelectProps> = ({
  medicines,
  valueId,
  onChange,
  disabled,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => (valueId ? medicines.find((m) => m.id === valueId) : undefined),
    [medicines, valueId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return medicines;
    return medicines.filter((m) => {
      const name = m.name.toLowerCase();
      const code = (m.code ?? '').toLowerCase();
      const gen = (m.genericName ?? '').toLowerCase();
      return name.includes(q) || code.includes(q) || gen.includes(q);
    });
  }, [medicines, query]);

  useEffect(() => {
    if (open) setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${highlight}"]`);
    if (el && 'scrollIntoView' in el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight, filtered.length, open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [close]);

  const pick = (m: MedicineOption) => {
    onChange(m.id, m.name);
    close();
  };

  const onInputFocus = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setOpen(true);
    setQuery(selected?.name ?? '');
  };

  const onInputBlur = () => {
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setQuery('');
    }, 180);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      setOpen(true);
      setQuery(selected ? selected.name : '');
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) pick(filtered[highlight]);
    }
  };

  const inputDisplay = open
    ? query
    : selected
      ? formatMedicine(selected)
      : '';

  return (
    <div ref={rootRef} style={{ flex: '1 1 220px', minWidth: 180, position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
        Medicine — search by name, code, or generic
      </label>
      <input
        type="text"
        aria-label="Medicine — search by name, code, or generic"
        value={inputDisplay}
        onChange={(e) => {
          const nextQuery = e.target.value;
          if (valueId) {
            onChange('', '');
          }
          setQuery(nextQuery);
          setOpen(true);
        }}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        onKeyDown={onKeyDown}
        placeholder="Type to search…"
        disabled={disabled}
        autoComplete="off"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          border: '1px solid #D1D5DB',
          borderRadius: 6,
          fontSize: 14,
        }}
      />
      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            maxHeight: 240,
            overflowY: 'auto',
            backgroundColor: '#FFF',
            border: '1px solid #D1D5DB',
            borderRadius: 6,
            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
            zIndex: 50,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#6B7280' }}>No matches</div>
          ) : (
            filtered.map((m, i) => (
              <button
                key={m.id}
                type="button"
                data-index={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  fontSize: 14,
                  border: 'none',
                  backgroundColor: i === highlight ? '#EFF6FF' : '#FFF',
                  cursor: 'pointer',
                  borderBottom: '1px solid #F3F4F6',
                }}
              >
                <span style={{ fontWeight: 500 }}>{m.name}</span>
                {m.code && <span style={{ color: '#6B7280', marginLeft: 6 }}>{m.code}</span>}
                {m.genericName && (
                  <span style={{ display: 'block', fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                    {m.genericName}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MedicineSearchSelect;
