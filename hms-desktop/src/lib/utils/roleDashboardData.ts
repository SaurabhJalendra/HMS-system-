import appointmentService from '../api/services/appointmentService';
import consultationService from '../api/services/consultationService';
import patientService from '../api/services/patientService';
import billingService from '../api/services/billingService';
import labTestService from '../api/services/labTestService';
import prescriptionService from '../api/services/prescriptionService';
import catalogService from '../api/services/catalogService';
import { LabTestStatus, type Appointment } from '../api/types';
import { toLocalYmd } from './localDate';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isAppointmentActiveForDay(a: Appointment): boolean {
  return !['CANCELLED', 'NO_SHOW'].includes(a.status);
}

/** Doctor dashboard — scoped to logged-in doctor */
export async function loadDoctorDashboardData(doctorId: string): Promise<Record<string, unknown>> {
  const today = toLocalYmd();

  const [aptsRes, consultRes] = await Promise.allSettled([
    appointmentService.getAppointments({ doctorId, date: today, limit: 100 }),
    consultationService.getConsultations({ doctorId, limit: 200, page: 1 }),
  ]);

  const appointments = aptsRes.status === 'fulfilled' ? aptsRes.value.appointments || [] : [];
  const consultations = consultRes.status === 'fulfilled' ? consultRes.value.consultations || [] : [];

  const activeToday = appointments.filter(isAppointmentActiveForDay);
  const todayAppointments = activeToday.length;

  const pendingStatuses = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'];
  const pendingConsultations = activeToday.filter((a) => {
    const hasConsult = Array.isArray((a as Appointment & { consultations?: { id: string }[] }).consultations)
      ? (a as Appointment & { consultations?: { id: string }[] }).consultations!.length > 0
      : false;
    return pendingStatuses.includes(a.status) && !hasConsult;
  }).length;

  const patientIds = new Set(consultations.map((c) => c.patientId));
  const totalPatients = patientIds.size;

  const todaySchedule = [...activeToday]
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .map((a) => ({
      name: (a as Appointment & { patient?: { name?: string } }).patient?.name || 'Patient',
      time: a.time || '—',
      status: a.status,
    }));

  const recentPatients = consultations.slice(0, 8).map((c) => ({
    name: c.patient?.name || 'Patient',
    time: c.consultationDate
      ? new Date(c.consultationDate).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
      : '',
    phone: c.patient?.phone,
  }));

  return {
    todayAppointments,
    pendingConsultations,
    totalPatients,
    todaySchedule,
    recentPatients,
    medicalAlerts: [] as { name: string; time?: string; status?: string }[],
  };
}

function mapAppointmentToListRow(a: Appointment) {
  return {
    name: (a as Appointment & { patient?: { name?: string } }).patient?.name || 'Patient',
    time: `${a.time || '—'} · ${a.status}`,
    phone: (a as Appointment & { patient?: { phone?: string } }).patient?.phone,
    status: a.status,
  };
}

/** Receptionist — hospital-wide today + billing */
export async function loadReceptionistDashboardData(): Promise<Record<string, unknown>> {
  const today = toLocalYmd();

  const [aptsRes, patientsRes, billingRes] = await Promise.allSettled([
    appointmentService.getAppointments({ date: today, limit: 200 }),
    patientService.getPatients({ createdFrom: today, page: 1, limit: 1 }),
    billingService.getBillingStats(30),
  ]);

  const appointments = aptsRes.status === 'fulfilled' ? aptsRes.value.appointments || [] : [];
  const billing = billingRes.status === 'fulfilled' ? billingRes.value : null;

  const todayAppointments = appointments.filter(isAppointmentActiveForDay).length;

  const newPatients =
    patientsRes.status === 'fulfilled'
      ? patientsRes.value.pagination?.totalItems || 0
      : 0;

  const pendingBills = billing?.pendingBills ?? 0;
  const paidBills = billing?.paidBills ?? 0;
  const totalBills = billing?.totalBills ?? 0;
  const monthlyRevenue = billing?.monthlyRevenue != null ? Number(billing.monthlyRevenue) : 0;

  const todayAppointmentsList = appointments
    .filter(isAppointmentActiveForDay)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .slice(0, 12)
    .map(mapAppointmentToListRow);

  const queueStatuses = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'];
  const patientQueue = appointments
    .filter((a) => queueStatuses.includes(a.status))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .slice(0, 12)
    .map(mapAppointmentToListRow);

  return {
    todayAppointments,
    newPatients,
    pendingBills,
    todayAppointmentsList,
    patientQueue,
    paidBills,
    totalBills,
    monthlyRevenue,
  };
}

/** Lab technician */
export async function loadLabTechDashboardData(): Promise<Record<string, unknown>> {
  const dayStart = startOfToday();

  const [pendingRes, inProgressRes, statsRes, completedRes] = await Promise.allSettled([
    labTestService.getPendingLabTests(),
    labTestService.getLabTests({ status: LabTestStatus.IN_PROGRESS, limit: 100, page: 1 }),
    labTestService.getLabTestStats(),
    labTestService.getLabTests({ status: LabTestStatus.COMPLETED, limit: 150, page: 1 }),
  ]);

  const pendingOnly = pendingRes.status === 'fulfilled' ? pendingRes.value.labTests || [] : [];
  const inProgressList = inProgressRes.status === 'fulfilled' ? inProgressRes.value.labTests || [] : [];
  const pendingList = [...pendingOnly, ...inProgressList];
  const stats = statsRes.status === 'fulfilled' ? statsRes.value : null;
  const completedList = completedRes.status === 'fulfilled' ? completedRes.value.labTests || [] : [];

  const pendingTests = pendingList.length;

  const completedToday = completedList.filter(
    (t) => t.completedAt && new Date(t.completedAt) >= dayStart,
  ).length;

  const totalSamples = stats?.totalLabTests ?? pendingTests + completedList.length;

  const pendingTestsList = pendingList.slice(0, 10).map((t) => ({
    name: t.testNameSnapshot || t.patient?.name || 'Test',
    time: t.patient?.name ? `Patient: ${t.patient.name}` : t.status,
    status: t.status,
  }));

  const recentResults = completedList.slice(0, 8).map((t) => ({
    name: t.testNameSnapshot || 'Test',
    time: t.completedAt
      ? new Date(t.completedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
      : t.status,
    status: 'COMPLETED',
  }));

  return {
    pendingTests,
    completedToday,
    totalSamples,
    pendingTestsList,
    recentResults,
    equipmentStatus: [] as { name: string; time?: string; status?: string }[],
  };
}

function isPrescriptionPending(p: { isDispensed?: boolean; status?: string }): boolean {
  if (p.isDispensed) return false;
  const st = (p.status || 'ACTIVE').toUpperCase();
  return st === 'ACTIVE';
}

/** Pharmacy */
export async function loadPharmacyDashboardData(): Promise<Record<string, unknown>> {
  const [statsRes, pendingRxRes, medsRes, rxPageRes] = await Promise.allSettled([
    prescriptionService.getPrescriptionStats(),
    prescriptionService.getPendingPrescriptions(),
    catalogService.getAllMedicines(),
    prescriptionService.getPrescriptions({ limit: 200, page: 1 }),
  ]);

  const stats = statsRes.status === 'fulfilled' ? (statsRes.value as Record<string, unknown>) : null;

  let pendingPrescriptionsList =
    pendingRxRes.status === 'fulfilled' ? pendingRxRes.value.prescriptions || [] : [];

  if (pendingPrescriptionsList.length === 0 && rxPageRes.status === 'fulfilled') {
    const all = rxPageRes.value.prescriptions || [];
    pendingPrescriptionsList = all.filter(isPrescriptionPending);
  }

  const pendingPrescriptions =
    typeof stats?.pendingPrescriptions === 'number'
      ? stats.pendingPrescriptions
      : pendingPrescriptionsList.length;

  const medicines = medsRes.status === 'fulfilled' ? medsRes.value.medicines || [] : [];
  const lowStockItems = medicines
    .filter((m) => m.stockQuantity <= (m.lowStockThreshold ?? 10))
    .slice(0, 15)
    .map((m) => ({
      name: m.name,
      time: m.code || '—',
      status: `Stock: ${m.stockQuantity}`,
    }));
  const lowStock = lowStockItems.length;

  let dispensedToday =
    typeof stats?.dispensedToday === 'number' ? stats.dispensedToday : undefined;
  if (dispensedToday === undefined && rxPageRes.status === 'fulfilled') {
    const dayStart = startOfToday();
    const dispensedList = (rxPageRes.value.prescriptions || []).filter(
      (p) =>
        p.isDispensed ||
        String((p as { status?: string }).status || '').toUpperCase() === 'DISPENSED',
    );
    dispensedToday = dispensedList.filter((p) => {
      const at = (p as { dispensedAt?: string; updatedAt?: string }).dispensedAt || p.updatedAt;
      return at && new Date(at) >= dayStart;
    }).length;
  }
  dispensedToday = dispensedToday ?? 0;

  const pendingPrescriptionsListRows = pendingPrescriptionsList.slice(0, 10).map((p) => ({
    name: p.patient?.name || 'Patient',
    time: (p as { prescriptionNumber?: string }).prescriptionNumber || new Date(p.createdAt).toLocaleDateString(),
    status: (p as { status?: string }).status || 'ACTIVE',
  }));

  return {
    pendingPrescriptions,
    lowStock,
    dispensedToday,
    pendingPrescriptionsList: pendingPrescriptionsListRows,
    lowStockItems,
  };
}
