import React, { useState, useCallback, useEffect } from 'react';
import patientService from '../../../lib/api/services/patientService';
import type { Patient } from '../../../lib/api/types';
import PatientCard from './PatientCard';
import LoadingSpinner from '../../common/LoadingSpinner';
import { daysAgoYmd } from '../../../lib/utils/localDate';

const SEARCH_LIMIT = 50;
const RECENT_DAYS = 5;

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

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
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
  }, [query]);

  const showRecent = !searched && !query.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (error) setError('');
            if (!e.target.value.trim()) setSearched(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSearch();
            }
          }}
          placeholder={placeholder}
          aria-label="Search patients"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: 14,
          }}
        />
        <button
          type="button"
          onClick={handleSearch}
          style={{
            padding: '8px 16px',
            backgroundColor: '#2563EB',
            color: '#FFF',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Search
        </button>
      </div>
      {error && (
        <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }} role="alert">
          {error}
        </p>
      )}
      {loading && <LoadingSpinner />}
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
              <PatientCard key={p.id} patient={p} compact onClick={() => onSelect(p)} />
            ))}
        </div>
      )}
      {!loading && searched && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.length === 0 ? (
            <p style={{ fontSize: 14, color: '#6B7280' }}>
              No patients found. Try another phone, name, or patient ID, or register a new patient.
            </p>
          ) : (
            results.map((p) => (
              <PatientCard key={p.id} patient={p} compact onClick={() => onSelect(p)} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default PatientSearch;
