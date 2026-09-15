import React, { useState, useCallback, useEffect, useRef } from 'react';
import patientService from '../../../lib/api/services/patientService';
import type { Patient } from '../../../lib/api/types';
import PatientCard from './PatientCard';
import LoadingSpinner from '../../common/LoadingSpinner';
import { daysAgoYmd } from '../../../lib/utils/localDate';
import { formatPatientNamePhone } from '../../../lib/utils/patientDisplay';

const SEARCH_LIMIT = 50;
const RECENT_DAYS = 5;
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Build API search string: normalize phone-style input (+91, spaces, dashes)
 * so it matches DB values that store plain digits. Keep full string for names / patient IDs.
 */
function buildSearchTerm(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const digits = t.replace(/\D/g, '');
  const hasLetters = /[a-zA-Z\u00C0-\u024F]/.test(t);
  if (!hasLetters && digits.length >= 3) {
    return digits;
  }
  return t;
}

interface PatientSearchProps {
  onSelect: (patient: Patient) => void;
  placeholder?: string;
  /** When set, list patients registered in this many recent days until the user searches. */
  recentDays?: number;
}

const PatientSearch: React.FC<PatientSearchProps> = ({
  onSelect,
  placeholder = 'Search by phone, name, or patient ID…',
  recentDays = RECENT_DAYS,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    patientService
      .getPatients({
        createdFrom: daysAgoYmd(recentDays),
        limit: SEARCH_LIMIT,
        page: 1,
      })
      .then(({ patients }) => {
        if (!cancelled) setRecentPatients(patients || []);
      })
      .catch((err: any) => {
        console.error('Recent patients error:', err);
        if (!cancelled) setRecentPatients([]);
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recentDays]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearched(false);
      setError('');
      return;
    }
    setLoading(true);
    setSearched(true);
    setError('');
    try {
      const searchTerm = buildSearchTerm(q);
      const { patients } = await patientService.getPatients({
        search: searchTerm,
        limit: SEARCH_LIMIT,
        page: 1,
      });
      setResults(patients || []);
      setDropdownOpen(true);
    } catch (err: any) {
      console.error('Patient search error:', err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Search failed. Check your connection and try again.';
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearched(false);
      setError('');
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  const handleSelect = (patient: Patient) => {
    onSelect(patient);
    setQuery(formatPatientNamePhone(patient));
    setDropdownOpen(false);
    setSearched(true);
    setResults([]);
  };

  const showRecent = !searched && !query.trim();
  const showDropdown = dropdownOpen && query.trim().length >= MIN_QUERY_LENGTH && !error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError('');
              if (!e.target.value.trim()) {
                setSearched(false);
                setDropdownOpen(false);
              } else {
                setDropdownOpen(true);
              }
            }}
            onFocus={() => {
              if (query.trim().length >= MIN_QUERY_LENGTH) setDropdownOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch(query);
              }
              if (e.key === 'Escape') setDropdownOpen(false);
            }}
            placeholder={placeholder}
            aria-label="Search patients"
            aria-autocomplete="list"
            autoComplete="off"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: 14,
            }}
          />
        </div>
        {showDropdown && (
          <div
            role="listbox"
            style={{
              position: 'absolute',
              zIndex: 20,
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              maxHeight: 240,
              overflowY: 'auto',
              backgroundColor: '#FFF',
              border: '1px solid #D1D5DB',
              borderRadius: 6,
            }}
          >
            {loading && (
              <div style={{ padding: 10, fontSize: 13, color: '#6B7280' }}>Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div style={{ padding: 10, fontSize: 13, color: '#6B7280' }}>
                No patients match “{query.trim()}”.
              </div>
            )}
            {!loading &&
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  onClick={() => handleSelect(p)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {formatPatientNamePhone(p)}
                </button>
              ))}
          </div>
        )}
      </div>
      {error && (
        <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }} role="alert">
          {error}
        </p>
      )}
      {loading && !showDropdown && <LoadingSpinner />}
      {showRecent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
            Registered in the last {recentDays} days
          </p>
          {recentLoading && <LoadingSpinner />}
          {!recentLoading && recentPatients.length === 0 && (
            <p style={{ fontSize: 14, color: '#6B7280' }}>
              No patients registered in the last {recentDays} days. Use search or register a new patient.
            </p>
          )}
          {!recentLoading &&
            recentPatients.map((p) => (
              <PatientCard key={p.id} patient={p} compact onClick={() => handleSelect(p)} />
            ))}
        </div>
      )}
    </div>
  );
};

export default PatientSearch;
