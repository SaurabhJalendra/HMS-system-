import React, { useState, useCallback, useEffect, useRef } from 'react';
import patientService from '../../../lib/api/services/patientService';
import appointmentService from '../../../lib/api/services/appointmentService';
import type { Patient } from '../../../lib/api/types';
import { AppointmentStatus } from '../../../lib/api/types';
import LoadingSpinner from '../../common/LoadingSpinner';
import { daysAgoYmd, toLocalYmd } from '../../../lib/utils/localDate';
import { formatPatientNamePhone } from '../../../lib/utils/patientDisplay';

const SEARCH_LIMIT = 50;
const RECENT_DAYS = 5;
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

const ACTIVE_APPOINTMENT_STATUSES = new Set<string>([
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.IN_PROGRESS,
]);

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 500,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
  color: '#6B7280',
  whiteSpace: 'nowrap',
};

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

function identityId(patient: Patient): string {
  return patient.aadharCardNumber || patient.passportNumber || '-';
}

async function loadScheduledDoctors(patientIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (patientIds.length === 0) return map;
  try {
    const { appointments } = await appointmentService.getAppointments({
      page: 1,
      limit: 100,
    });
    const today = toLocalYmd(new Date());
    const upcoming = (appointments || []).filter((apt) => {
      if (!ACTIVE_APPOINTMENT_STATUSES.has(apt.status)) return false;
      const aptDay = toLocalYmd(apt.date);
      return !aptDay || aptDay >= today;
    });
    upcoming.sort((a, b) => {
      const day = String(a.date).localeCompare(String(b.date));
      if (day !== 0) return day;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
    const wanted = new Set(patientIds);
    upcoming.forEach((apt) => {
      if (!wanted.has(apt.patientId) || map[apt.patientId]) return;
      const name = apt.doctor?.fullName?.trim();
      if (name) map[apt.patientId] = name;
    });
  } catch (err) {
    console.error('Scheduled doctor lookup failed', err);
  }
  return map;
}

interface PatientSearchProps {
  onSelect: (patient: Patient) => void;
  placeholder?: string;
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
  const [doctorByPatientId, setDoctorByPatientId] = useState<Record<string, string>>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const { patients } = await patientService.getPatients({
        createdFrom: daysAgoYmd(recentDays),
        limit: SEARCH_LIMIT,
        page: 1,
      });
      setRecentPatients(patients || []);
    } catch (err: any) {
      console.error('Recent patients error:', err);
      setRecentPatients([]);
    } finally {
      setRecentLoading(false);
    }
  }, [recentDays]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

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

  const showingSearchResults = searched && query.trim().length >= MIN_QUERY_LENGTH;
  const tablePatients = showingSearchResults ? results : recentPatients;
  const tablePatientKey = tablePatients.map((p) => p.id).join('|');

  useEffect(() => {
    let cancelled = false;
    const ids = tablePatientKey ? tablePatientKey.split('|') : [];
    void loadScheduledDoctors(ids).then((map) => {
      if (!cancelled) setDoctorByPatientId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [tablePatientKey]);

  const handleSelect = (patient: Patient) => {
    onSelect(patient);
    setDropdownOpen(false);
  };

  const showDropdown = dropdownOpen && query.trim().length >= MIN_QUERY_LENGTH && !error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 16 }}>
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
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={() => void runSearch(query)}
            style={{
              backgroundColor: '#4B5563',
              color: '#FFF',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSearched(false);
              setResults([]);
              setDropdownOpen(false);
              void loadRecent();
            }}
            style={{
              backgroundColor: '#2563EB',
              color: '#FFF',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Refresh
          </button>
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
                  onMouseDown={(e) => e.preventDefault()}
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
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
        {showingSearchResults
          ? 'Search results'
          : `Registered in the last ${recentDays} days`}
      </p>
      {(loading || recentLoading) && <LoadingSpinner />}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#F9FAFB' }}>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Age</th>
              <th style={thStyle}>Gender</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>ID (Aadhar/Passport)</th>
              <th style={thStyle}>Blood Group</th>
              <th style={thStyle}>Doctor</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody style={{ backgroundColor: '#FFF' }}>
            {tablePatients.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>
                  {loading || recentLoading
                    ? 'Loading...'
                    : showingSearchResults
                      ? 'No patients found for this search.'
                      : `No patients registered in the last ${recentDays} days. Use search or register a new patient.`}
                </td>
              </tr>
            ) : (
              tablePatients.map((patient) => (
                <tr key={patient.id} style={{ borderTop: '1px solid #E5E7EB' }}>
                  <td style={{ ...tdStyle, color: '#111827', fontWeight: 500 }}>{patient.name || 'N/A'}</td>
                  <td style={tdStyle}>{patient.age ?? 'N/A'}</td>
                  <td style={tdStyle}>{patient.gender || 'N/A'}</td>
                  <td style={tdStyle}>{patient.phone || 'N/A'}</td>
                  <td style={tdStyle}>{identityId(patient)}</td>
                  <td style={tdStyle}>{patient.bloodGroup || 'N/A'}</td>
                  <td style={tdStyle}>{doctorByPatientId[patient.id] || '—'}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => handleSelect(patient)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#059669',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      Select
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PatientSearch;
