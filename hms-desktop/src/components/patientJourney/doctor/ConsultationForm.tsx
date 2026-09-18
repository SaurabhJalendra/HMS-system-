import React, { useState, useEffect, useCallback } from 'react';
import consultationService from '../../../lib/api/services/consultationService';
import labTestService from '../../../lib/api/services/labTestService';
import type { Appointment } from '../../../lib/api/types';
import type { LabTest, TestCatalog } from '../../../lib/api/types';
import LoadingSpinner from '../../common/LoadingSpinner';
import { useCriticalUpdateLock } from '../../../lib/hooks/useCriticalUpdateLock';
import { toLocalYmd } from '../../../lib/utils/localDate';

interface ConsultationFormProps {
  appointment: Appointment;
  doctorId: string;
  /** When resuming a held consultation, pass the consultation id to load draft diagnosis/notes. */
  resumeConsultationId?: string | null;
  onSuccess: (consultationId: string) => void;
  onBack: () => void;
  /** Called after a successful hold + optional lab orders; parent should return to queue and refresh. */
  onHoldComplete?: () => void;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function defaultHoldDatetimeLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return defaultHoldDatetimeLocal();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const ConsultationForm: React.FC<ConsultationFormProps> = ({
  appointment,
  doctorId,
  resumeConsultationId,
  onSuccess,
  onBack,
  onHoldComplete,
}) => {
  useCriticalUpdateLock(true, 'consultation');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [temperature, setTemperature] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [holdUntil, setHoldUntil] = useState(defaultHoldDatetimeLocal);
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<TestCatalog[]>([]);
  const [labSearch, setLabSearch] = useState('');
  const [existingLabTests, setExistingLabTests] = useState<LabTest[]>([]);
  const [loadingExistingLabs, setLoadingExistingLabs] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingResume, setLoadingResume] = useState(false);
  const [error, setError] = useState('');

  const patientId = appointment.patientId || (appointment as Appointment & { patient?: { id?: string } }).patient?.id;
  if (!patientId) return <p style={{ color: '#DC2626' }}>Missing patient for this appointment.</p>;

  const patientName =
    (appointment as Appointment & { patient?: { name?: string } }).patient?.name ?? 'Patient';
  const patient = appointment.patient;
  const filteredCatalog = catalog.filter((test) => {
    const query = labSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      test.testName.toLowerCase().includes(query) ||
      (test.category || '').toLowerCase().includes(query)
    );
  });

  const toggleTest = (id: string) => {
    setSelectedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingLinkedLabs = existingLabTests.filter(
    (test) => test.status === 'PENDING' || test.status === 'IN_PROGRESS',
  );
  const resumeBlockedByPendingLabs = Boolean(resumeConsultationId) && pendingLinkedLabs.length > 0;

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);
    labTestService
      .getTestCatalog(true, true)
      .then((data) => {
        if (!cancelled && data?.testCatalog) {
          setCatalog(data.testCatalog.filter((t) => t.isActive !== false));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resetForNewVisit = useCallback(() => {
    setActiveConsultationId(null);
    setDiagnosis('');
    setNotes('');
    setTemperature('');
    setBloodPressure('');
    setFollowUpDate('');
    setSelectedTestIds(new Set());
    setExistingLabTests([]);
    setHoldUntil(defaultHoldDatetimeLocal());
  }, []);

  useEffect(() => {
    if (!resumeConsultationId) {
      resetForNewVisit();
      return;
    }

    let cancelled = false;
    setLoadingResume(true);
    consultationService
      .getConsultationById(resumeConsultationId)
      .then(({ consultation }) => {
        if (cancelled) return;
        setActiveConsultationId(consultation.id);
        setDiagnosis(consultation.diagnosis || '');
        setNotes(consultation.notes || '');
        setTemperature(consultation.temperature != null ? String(consultation.temperature) : '');
        setBloodPressure(consultation.bloodPressure || '');
        setFollowUpDate(
          consultation.followUpDate
            ? toDatetimeLocalValue(consultation.followUpDate).slice(0, 10)
            : '',
        );
        if (consultation.heldUntil) {
          setHoldUntil(toDatetimeLocalValue(consultation.heldUntil));
        } else {
          setHoldUntil(defaultHoldDatetimeLocal());
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load held consultation.');
      })
      .finally(() => {
        if (!cancelled) setLoadingResume(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resumeConsultationId, appointment.id, resetForNewVisit]);

  useEffect(() => {
    if (!resumeConsultationId) {
      setExistingLabTests([]);
      return;
    }
    let cancelled = false;
    setLoadingExistingLabs(true);
    labTestService
      .getLabTests({ patientId, page: 1, limit: 100 })
      .then(({ labTests }) => {
        if (cancelled) return;
        setExistingLabTests(
          (labTests || []).filter(
            (test) =>
              test.consultationId === resumeConsultationId ||
              test.appointmentId === appointment.id,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setError('Could not load lab orders for this consultation.');
      })
      .finally(() => {
        if (!cancelled) setLoadingExistingLabs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appointment.id, patientId, resumeConsultationId]);

  const orderSelectedLabs = async (consultationId: string) => {
    for (const testCatalogId of selectedTestIds) {
      await labTestService.createLabTest({
        patientId,
        orderedBy: doctorId,
        testCatalogId,
        consultationId,
        appointmentId: appointment.id,
        notes: notes.trim() || undefined,
      });
    }
  };

  const openLinkedReport = async (testId: string) => {
    try {
      await labTestService.downloadLabTestReport(testId);
    } catch {
      setError('Could not open the lab report.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagnosis.trim()) {
      setError('Diagnosis is required.');
      return;
    }
    if (resumeBlockedByPendingLabs) {
      setError(
        `Cannot complete this consultation while ${pendingLinkedLabs.length} lab test${pendingLinkedLabs.length === 1 ? '' : 's'} ${pendingLinkedLabs.length === 1 ? 'is' : 'are'} still pending or in progress. Hold again or wait for results.`,
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (activeConsultationId) {
        await consultationService.updateConsultation(activeConsultationId, {
          diagnosis: diagnosis.trim(),
          notes: notes.trim() || undefined,
          temperature: temperature ? Number(temperature) : null,
          bloodPressure: bloodPressure.trim() || null,
          followUpDate: followUpDate || null,
          heldUntil: null,
        });
        await orderSelectedLabs(activeConsultationId);
        onSuccess(activeConsultationId);
        return;
      }

      const { consultation } = await consultationService.createConsultation({
        appointmentId: appointment.id,
        patientId,
        doctorId,
        diagnosis: diagnosis.trim(),
        notes: notes.trim() || undefined,
        temperature: temperature ? Number(temperature) : undefined,
        bloodPressure: bloodPressure.trim() || undefined,
        followUpDate: followUpDate || undefined,
      });
      await orderSelectedLabs(consultation.id);
      onSuccess(consultation.id);
    } catch (err: unknown) {
      const e = err as { existingConsultationId?: string; response?: { data?: { message?: string } }; message?: string };
      if (e?.existingConsultationId) {
        try {
          await consultationService.updateConsultation(e.existingConsultationId, {
            diagnosis: diagnosis.trim(),
            notes: notes.trim() || undefined,
            temperature: temperature ? Number(temperature) : null,
            bloodPressure: bloodPressure.trim() || null,
            followUpDate: followUpDate || null,
            heldUntil: null,
          });
          await orderSelectedLabs(e.existingConsultationId);
          onSuccess(e.existingConsultationId);
        } catch (inner) {
          const ie = inner as { response?: { data?: { message?: string } }; message?: string };
          setError(ie?.response?.data?.message || ie?.message || 'Failed to update consultation');
        }
        return;
      }
      const apiMsg = e?.response?.data?.message;
      setError(apiMsg || e?.message || 'Failed to save consultation');
    } finally {
      setLoading(false);
    }
  };

  const handleHoldAndLabs = async () => {
    if (!diagnosis.trim()) {
      setError('Enter a provisional diagnosis before holding (e.g. “Awaiting CBC”).');
      return;
    }
    if (!holdUntil) {
      setError('Choose when you plan to resume (hold until).');
      return;
    }
    const heldIso = new Date(holdUntil).toISOString();
    if (Number.isNaN(new Date(holdUntil).getTime())) {
      setError('Invalid hold date/time.');
      return;
    }
    if (new Date(holdUntil).getTime() <= Date.now()) {
      setError('Hold until must be a future date and time.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      let cid = activeConsultationId;

      if (cid) {
        await consultationService.updateConsultation(cid, {
          diagnosis: diagnosis.trim(),
          notes: notes.trim() || undefined,
          temperature: temperature ? Number(temperature) : null,
          bloodPressure: bloodPressure.trim() || null,
          followUpDate: followUpDate || null,
          heldUntil: heldIso,
        });
      } else {
        const { consultation } = await consultationService.createConsultation({
          appointmentId: appointment.id,
          patientId,
          doctorId,
          diagnosis: diagnosis.trim(),
          notes: notes.trim() || undefined,
          temperature: temperature ? Number(temperature) : undefined,
          bloodPressure: bloodPressure.trim() || undefined,
          followUpDate: followUpDate || undefined,
          heldUntil: heldIso,
        });
        cid = consultation.id;
        setActiveConsultationId(cid);
      }

      await orderSelectedLabs(cid);

      onHoldComplete?.();
    } catch (err: unknown) {
      const e = err as { existingConsultationId?: string; response?: { data?: { message?: string; errors?: { message?: string }[] } }; message?: string };
      if (e?.existingConsultationId) {
        try {
          const cid = e.existingConsultationId;
          await consultationService.updateConsultation(cid, {
            diagnosis: diagnosis.trim(),
            notes: notes.trim() || undefined,
            temperature: temperature ? Number(temperature) : null,
            bloodPressure: bloodPressure.trim() || null,
            followUpDate: followUpDate || null,
            heldUntil: heldIso,
          });
          setActiveConsultationId(cid);
          await orderSelectedLabs(cid);
          onHoldComplete?.();
        } catch {
          setError('A consultation already exists. Open it from the queue with “Resume (held — lab)”.');
        }
        return;
      }
      const zodErrors = e?.response?.data?.errors;
      const zodMsg =
        Array.isArray(zodErrors) && zodErrors.length > 0
          ? zodErrors.map((x) => x.message).filter(Boolean).join('; ')
          : '';
      setError(zodMsg || e?.response?.data?.message || e?.message || 'Failed to hold consultation');
    } finally {
      setLoading(false);
    }
  };

  if (loadingResume) {
    return <LoadingSpinner text="Loading consultation…" />;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ marginBottom: 12, fontSize: 14 }}>
        Consultation for <strong>{patientName}</strong> ({appointment.time})
        {resumeConsultationId && (
          <span style={{ marginLeft: 8, fontSize: 13, color: '#B45309' }}>— on hold / resume</span>
        )}
      </p>
      {patient && (
        <div style={{ marginBottom: 12, padding: 12, border: '1px solid #BFDBFE', borderRadius: 8, backgroundColor: '#EFF6FF', fontSize: 13 }}>
          <strong>Clinical context</strong>
          <div style={{ marginTop: 6 }}>
            Age: {patient.age ?? '—'} · Gender: {patient.gender || '—'} · Blood group: {patient.bloodGroup || '—'} · Phone: {patient.phone || '—'}
          </div>
          <div style={{ marginTop: 4 }}><strong>Allergies:</strong> {patient.allergies || 'None recorded'}</div>
          <div style={{ marginTop: 4 }}><strong>Chronic conditions:</strong> {patient.chronicConditions || 'None recorded'}</div>
          <div style={{ marginTop: 6 }}>
            <strong>Recent consultations:</strong>{' '}
            {patient.consultations?.length
              ? patient.consultations
                  .slice(0, 3)
                  .map((consultation) => `${consultation.diagnosis} (${toLocalYmd(consultation.consultationDate)})`)
                  .join(' · ')
              : 'No prior history returned'}
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <p style={{ color: '#DC2626', fontSize: 14 }}>{error}</p>}
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Diagnosis *</label>
          <textarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            required
            rows={3}
            placeholder="Provisional or final diagnosis"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: 14,
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>
            Temperature (°C)
            <input
              type="number"
              min="30"
              max="45"
              step="0.1"
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6 }}
            />
          </label>
          <label style={{ fontSize: 14, fontWeight: 500 }}>
            Blood pressure
            <input
              value={bloodPressure}
              onChange={(event) => setBloodPressure(event.target.value)}
              placeholder="e.g. 120/80"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6 }}
            />
          </label>
          <label style={{ fontSize: 14, fontWeight: 500 }}>
            Follow-up date
            <input
              type="date"
              value={followUpDate}
              min={toLocalYmd()}
              onChange={(event) => setFollowUpDate(event.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6 }}
            />
          </label>
        </div>

        <div
          style={{
            padding: 14,
            border: '1px solid #BFDBFE',
            borderRadius: 8,
            backgroundColor: '#F0F9FF',
          }}
        >
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#1E3A5F' }}>
            Lab tests during consultation
          </h4>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#374151' }}>
            Select tests to order now. They are linked to this visit. Use <strong>Hold consultation</strong> below to
            send the patient to the lab and return to the queue.
          </p>
          {resumeConsultationId && (
            <div style={{ marginBottom: 10, padding: 10, border: '1px solid #D1D5DB', borderRadius: 6, backgroundColor: '#FFF' }}>
              <strong style={{ fontSize: 13 }}>Existing lab orders</strong>
              {loadingExistingLabs ? (
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>Loading lab orders…</p>
              ) : existingLabTests.length === 0 ? (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B7280' }}>No linked lab orders.</p>
              ) : (
                <>
                  {resumeBlockedByPendingLabs && (
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#B45309' }}>
                      {pendingLinkedLabs.length} linked test{pendingLinkedLabs.length === 1 ? '' : 's'} still pending.
                      Save is blocked until results are entered; you can hold again if the patient should return later.
                    </p>
                  )}
                  {existingLabTests.map((test) => (
                    <div key={test.id} style={{ marginTop: 6, fontSize: 13 }}>
                      {test.testNameSnapshot} — <strong>{test.status}</strong>
                      {test.results ? <div style={{ color: '#374151' }}>Result: {test.results}</div> : null}
                      {test.reportFile ? (
                        <button
                          type="button"
                          onClick={() => openLinkedReport(test.id)}
                          style={{ marginTop: 3, padding: 0, border: 0, color: '#2563EB', background: 'transparent', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
                        >
                          View report
                        </button>
                      ) : null}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          <input
            type="search"
            value={labSearch}
            onChange={(event) => setLabSearch(event.target.value)}
            placeholder="Search lab tests by name or category"
            aria-label="Search lab tests"
            style={{ width: '100%', marginBottom: 8, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}
          />
          {selectedTestIds.size > 0 && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#1D4ED8' }}>
              {selectedTestIds.size} test{selectedTestIds.size === 1 ? '' : 's'} selected
            </p>
          )}
          {loadingCatalog ? (
            <LoadingSpinner text="Loading test catalog…" />
          ) : (
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                padding: 8,
                backgroundColor: '#FFF',
              }}
            >
              {filteredCatalog.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>No active tests in catalog.</p>
              ) : (
                filteredCatalog.map((t) => (
                  <label
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 4px',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTestIds.has(t.id)}
                      onChange={() => toggleTest(t.id)}
                    />
                    <span>
                      {t.testName}
                      {t.category ? <span style={{ color: '#6B7280' }}> · {t.category}</span> : null}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 14,
            border: '1px solid #FDE68A',
            borderRadius: 8,
            backgroundColor: '#FFFBEB',
          }}
        >
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#92400E' }}>
            Hold consultation (wait for lab)
          </h4>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#78350F' }}>
            Set when you plan to see the patient again. The visit stays <strong>in progress</strong> until you resume
            from the queue and continue to prescription.
          </p>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Hold until (date & time)</label>
          <input
            type="datetime-local"
            value={holdUntil}
            min={defaultHoldDatetimeLocal()}
            onChange={(e) => setHoldUntil(e.target.value)}
            style={{
              padding: '8px 10px',
              border: '1px solid #D1D5DB',
              borderRadius: 6,
              fontSize: 14,
              marginBottom: 10,
            }}
          />
          <button
            type="button"
            disabled={loading}
            onClick={handleHoldAndLabs}
            style={{
              padding: '10px 16px',
              backgroundColor: loading ? '#9CA3AF' : '#D97706',
              color: '#FFF',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Hold consultation & order selected labs → queue
          </button>
        </div>

        {loading && <LoadingSpinner />}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '10px 16px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: 'pointer',
              backgroundColor: '#FFF',
            }}
          >
            Back to queue
          </button>
          <button
            type="submit"
            disabled={loading || !diagnosis.trim() || resumeBlockedByPendingLabs}
            style={{
              padding: '10px 16px',
              backgroundColor: loading || !diagnosis.trim() || resumeBlockedByPendingLabs ? '#9CA3AF' : '#059669',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              cursor: loading || !diagnosis.trim() || resumeBlockedByPendingLabs ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {resumeBlockedByPendingLabs ? 'Save blocked — labs still pending' : 'Save consultation → Write prescription'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConsultationForm;
