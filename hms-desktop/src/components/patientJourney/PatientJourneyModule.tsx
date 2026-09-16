import React, { useState } from 'react';
import { UserRole } from '../../lib/api/types';
import type { User } from '../../types';
import type { Patient } from '../../lib/api/types';
import type { Appointment } from '../../lib/api/types';
import PatientRegistrationStep from './receptionist/PatientRegistrationStep';
import AppointmentSchedulingStep from './receptionist/AppointmentSchedulingStep';
import QueueConfirmation from './receptionist/QueueConfirmation';
import TodaysQueue from './doctor/TodaysQueue';
import ConsultationForm from './doctor/ConsultationForm';
import PrescriptionWriter from './doctor/PrescriptionWriter';
import type { OpdQueueRowKind } from './doctor/opdQueueHelpers';
import { toLocalYmd } from '../../lib/utils/localDate';
import { isAdminLevelRole } from '../../lib/utils/rolePermissions';
import InfoButton from '../common/InfoButton';
import { getInfoContent } from '../../lib/infoContent';

interface PatientJourneyModuleProps {
  user: User;
  isAuthenticated: boolean;
  onBack: () => void;
  initialAction?: any;
}

type ReceptionistStep = 'registration' | 'scheduling' | 'confirmation';
type DoctorStep = 'queue' | 'consultation' | 'prescription' | 'visitComplete';

const PatientJourneyModule: React.FC<PatientJourneyModuleProps> = ({ user, isAuthenticated: _isAuthenticated, onBack, initialAction }) => {
  const role = user?.role as UserRole;

  const actionName =
    typeof initialAction === 'string' ? initialAction : initialAction?.action || initialAction?.type;
  const isAddPatient = actionName === 'addPatient' || actionName === 'newPatient';
  const isBookAppointment =
    actionName === 'bookAppointment' || actionName === 'searchPatients' || actionName === 'viewPatients';
  const isConsultQueue = actionName === 'consultQueue';

  // Receptionist state
  const [receptionistStep, setReceptionistStep] = useState<ReceptionistStep>('registration');
  const [receptionistPatient, setReceptionistPatient] = useState<Patient | null>(null);
  const [receptionistAppointment, setReceptionistAppointment] = useState<Appointment | null>(null);

  // Doctor state
  const [doctorStep, setDoctorStep] = useState<DoctorStep>('queue');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [createdConsultationIdValue, setCreatedConsultationIdValue] = useState<string | null>(null);
  /** True when user opened prescription from queue (existing consultation) — Back goes to queue, not consultation form. */
  const [fromQueueDirectToPrescription, setFromQueueDirectToPrescription] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);

  // SUBADMIN mirrors ADMIN: it can drive both the reception and doctor halves of OPD
  const isAdminLevel = isAdminLevelRole(role);
  const isReceptionist = role === UserRole.RECEPTIONIST || isAdminLevel;
  const isDoctor = role === UserRole.DOCTOR || isAdminLevel;
  const receptionistMode: 'search' | 'new' = isAddPatient ? 'new' : 'search';
  const queueDate = isConsultQueue
    ? toLocalYmd(initialAction?.appointmentDate || initialAction?.date)
    : undefined;
  const focusAppointmentId = isConsultQueue ? initialAction?.appointmentId : undefined;
  const queueDoctorId = isConsultQueue ? initialAction?.doctorId : undefined;

  const showReceptionistSection = isReceptionist && !isConsultQueue && (role !== UserRole.DOCTOR || isAdminLevel);
  const showDoctorSection = isDoctor && !isAddPatient && !isBookAppointment && (role !== UserRole.RECEPTIONIST || isAdminLevel);

  const handleReceptionistPatientReady = (patient: Patient) => {
    setReceptionistPatient(patient);
    setReceptionistStep('scheduling');
  };

  const handleReceptionistScheduled = (appointment: Appointment) => {
    setReceptionistAppointment(appointment);
    setReceptionistStep('confirmation');
  };

  const handleReceptionistStartOver = () => {
    setReceptionistPatient(null);
    setReceptionistAppointment(null);
    setReceptionistStep('registration');
  };

  const handleDoctorSelectAppointment = (appointment: Appointment, kind: OpdQueueRowKind) => {
    setSelectedAppointment(appointment);
    setFromQueueDirectToPrescription(false);

    if (kind === 'completed') {
      const cid = appointment.consultations?.[0]?.id ?? null;
      setCreatedConsultationIdValue(cid);
      setDoctorStep('visitComplete');
      return;
    }

    if (kind === 'held') {
      const cid = appointment.consultations?.[0]?.id ?? null;
      setCreatedConsultationIdValue(cid);
      setFromQueueDirectToPrescription(false);
      setDoctorStep('consultation');
      return;
    }

    if (kind === 'prescription') {
      const cid = appointment.consultations?.[0]?.id ?? null;
      if (!cid) {
        setCreatedConsultationIdValue(null);
        setDoctorStep('consultation');
        return;
      }
      setCreatedConsultationIdValue(cid);
      setFromQueueDirectToPrescription(true);
      setDoctorStep('prescription');
      return;
    }

    setCreatedConsultationIdValue(null);
    setDoctorStep('consultation');
  };

  const handleConsultationSuccess = (consultationId: string) => {
    setFromQueueDirectToPrescription(false);
    setCreatedConsultationIdValue(consultationId);
    setDoctorStep('prescription');
  };

  const handlePrescriptionDone = () => {
    setSelectedAppointment(null);
    setCreatedConsultationIdValue(null);
    setFromQueueDirectToPrescription(false);
    setDoctorStep('queue');
    setQueueRefreshKey((k) => k + 1);
  };

  const handleDoctorBackToQueue = () => {
    setSelectedAppointment(null);
    setCreatedConsultationIdValue(null);
    setFromQueueDirectToPrescription(false);
    setDoctorStep('queue');
  };

  const handleConsultationHoldComplete = () => {
    setSelectedAppointment(null);
    setCreatedConsultationIdValue(null);
    setFromQueueDirectToPrescription(false);
    setDoctorStep('queue');
    setQueueRefreshKey((k) => k + 1);
  };

  const handlePrescriptionBack = () => {
    if (fromQueueDirectToPrescription) {
      handleDoctorBackToQueue();
    } else {
      setDoctorStep('consultation');
    }
  };

  const showReceptionistFlow = isReceptionist && (role === UserRole.RECEPTIONIST || receptionistStep !== undefined);
  const showDoctorFlow = isDoctor && (role === UserRole.DOCTOR || doctorStep !== undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, backgroundColor: '#F0F0F0', minHeight: '100%' }}>
      <div style={{ backgroundColor: '#FFF', borderBottom: '1px solid #E5E7EB', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>OPD Flow</h1>
          <InfoButton title={getInfoContent('opdFlow').title} content={getInfoContent('opdFlow').content} size="xs" variant="info" />
        </div>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '8px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            backgroundColor: '#FFF',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <div style={{ padding: 24, flex: 1 }}>
        {isAdminLevel && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', fontSize: 14 }}>
            You are logged in as {role === UserRole.ADMIN ? 'Admin' : 'Sub-Admin'}. Use the
            tabs below to act as Receptionist or Doctor flow.
          </div>
        )}

        {showReceptionistSection && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Receptionist: Register & schedule</h2>
            {receptionistStep === 'registration' && (
              <PatientRegistrationStep
                key={receptionistMode}
                initialMode={receptionistMode}
                onPatientReady={handleReceptionistPatientReady}
              />
            )}
            {receptionistStep === 'scheduling' && (
              <AppointmentSchedulingStep
                patient={receptionistPatient}
                onScheduled={handleReceptionistScheduled}
              />
            )}
            {receptionistStep === 'confirmation' && receptionistPatient && receptionistAppointment && (
              <QueueConfirmation
                patient={receptionistPatient}
                appointment={receptionistAppointment}
                onStartOver={handleReceptionistStartOver}
              />
            )}
          </section>
        )}

        {showDoctorSection && (
          <section>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Doctor: Queue → Consult → Prescribe</h2>
            {doctorStep === 'queue' && (
              <TodaysQueue
                currentUserId={user.id}
                doctorId={queueDoctorId}
                queueDate={queueDate}
                focusAppointmentId={focusAppointmentId}
                onSelectAppointment={handleDoctorSelectAppointment}
                refreshKey={queueRefreshKey}
              />
            )}
            {doctorStep === 'visitComplete' && selectedAppointment && (
              <div style={{ maxWidth: 560, padding: 20, backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>
                  This visit is complete: consultation and prescription are on file.
                </p>
                <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>
                  {(selectedAppointment as any).patient?.name ?? 'Patient'} · {selectedAppointment.time}
                </p>
                {selectedAppointment.prescriptions?.[0] && (
                  <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6B7280' }}>
                    Prescription:{' '}
                    <strong>{selectedAppointment.prescriptions[0].prescriptionNumber}</strong> (
                    {selectedAppointment.prescriptions[0].status})
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleDoctorBackToQueue}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Back to queue
                </button>
              </div>
            )}
            {doctorStep === 'consultation' && selectedAppointment && (
              <ConsultationForm
                appointment={selectedAppointment}
                doctorId={user.id}
                resumeConsultationId={
                  selectedAppointment.consultations?.[0]?.heldUntil
                    ? selectedAppointment.consultations[0].id
                    : null
                }
                onSuccess={handleConsultationSuccess}
                onBack={handleDoctorBackToQueue}
                onHoldComplete={handleConsultationHoldComplete}
              />
            )}
            {doctorStep === 'prescription' && selectedAppointment && (
              <PrescriptionWriter
                appointment={selectedAppointment}
                consultationId={createdConsultationIdValue}
                doctorId={user.id}
                onDone={handlePrescriptionDone}
                onBack={handlePrescriptionBack}
              />
            )}
          </section>
        )}

        {!showReceptionistSection && !showDoctorSection && (
          <p style={{ color: '#6B7280' }}>OPD Flow is available to Receptionist and Doctor roles.</p>
        )}
      </div>
    </div>
  );
};

export default PatientJourneyModule;
