import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';

const mockPrisma = {
  $executeRaw: jest.fn(),
  patient: { findUnique: jest.fn() },
  appointment: { findUnique: jest.fn(), update: jest.fn() },
  consultation: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  medicineCatalog: { findMany: jest.fn() },
  prescription: {
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  prescriptionAudit: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: 'Serializable',
    },
  },
  PrescriptionStatus: {
    ACTIVE: 'ACTIVE',
    DISPENSED: 'DISPENSED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
  },
  AppointmentStatus: {
    COMPLETED: 'COMPLETED',
  },
  UserRole: {
    ADMIN: 'ADMIN',
    SUBADMIN: 'SUBADMIN',
    DOCTOR: 'DOCTOR',
  },
}));

import { createPrescription } from '../../controllers/prescriptionController';

const response = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as unknown as Response;

const request = (
  role: 'DOCTOR' | 'ADMIN' | 'SUBADMIN',
  links: { appointmentId?: string; consultationId?: string } = {},
) =>
  ({
    user: {
      id: role === 'DOCTOR' ? 'doctor-actor' : 'admin-actor',
      username: 'actor',
      fullName: 'Actor',
      role,
    },
    body: {
      patientId: 'patient-1',
      ...links,
      items: [
        {
          medicineId: 'medicine-1',
          quantity: 1,
          frequency: 'OD',
          duration: 3,
        },
      ],
    },
  }) as unknown as AuthRequest;

describe('Prescription Controller OPD relationship validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    mockPrisma.patient.findUnique.mockResolvedValue({ id: 'patient-1' });
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-actor',
    });
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: 'consultation-1',
      patientId: 'patient-1',
      doctorId: 'doctor-actor',
      appointmentId: 'appointment-1',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'doctor-actor' });
    mockPrisma.prescription.findFirst.mockResolvedValue(null);
    mockPrisma.medicineCatalog.findMany.mockResolvedValue([
      { id: 'medicine-1', price: 10 },
    ]);
    mockPrisma.prescription.count.mockResolvedValue(0);
    mockPrisma.prescription.create.mockResolvedValue({
      id: 'prescription-1',
      prescriptionNumber: 'RX202609170001',
      patientId: 'patient-1',
      doctorId: 'doctor-actor',
      totalAmount: 30,
      prescriptionItems: [{ id: 'item-1' }],
    });
    mockPrisma.prescriptionAudit.create.mockResolvedValue({});
    mockPrisma.appointment.update.mockResolvedValue({ id: 'appointment-1' });
  });

  it('rejects a doctor prescribing against another doctor appointment', async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-other',
    });
    const res = response();

    await createPrescription(
      request('DOCTOR', { appointmentId: 'appointment-1' }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.prescription.create).not.toHaveBeenCalled();
  });

  it('rejects a patient that does not match the appointment', async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      patientId: 'patient-other',
      doctorId: 'doctor-actor',
    });
    const res = response();

    await createPrescription(
      request('DOCTOR', { appointmentId: 'appointment-1' }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Patient ID does not match appointment',
    });
  });

  it('rejects a consultation linked to a different appointment', async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: 'consultation-1',
      patientId: 'patient-1',
      doctorId: 'doctor-actor',
      appointmentId: 'appointment-other',
    });
    const res = response();

    await createPrescription(
      request('DOCTOR', {
        appointmentId: 'appointment-1',
        consultationId: 'consultation-1',
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Consultation does not belong to appointment',
    });
  });

  it('attributes an admin-created linked prescription to the treating doctor', async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-treating',
    });
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: 'consultation-1',
      patientId: 'patient-1',
      doctorId: 'doctor-treating',
      appointmentId: 'appointment-1',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'doctor-treating' });
    mockPrisma.prescription.create.mockResolvedValue({
      id: 'prescription-1',
      prescriptionNumber: 'RX202609170001',
      patientId: 'patient-1',
      doctorId: 'doctor-treating',
      totalAmount: 30,
      prescriptionItems: [{ id: 'item-1' }],
    });

    await createPrescription(
      request('SUBADMIN', {
        appointmentId: 'appointment-1',
        consultationId: 'consultation-1',
      }),
      response(),
    );

    expect(mockPrisma.prescription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ doctorId: 'doctor-treating' }),
      }),
    );
    expect(mockPrisma.prescriptionAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        prescriptionId: 'prescription-1',
        performedBy: 'admin-actor',
      }),
    });
    expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { status: 'COMPLETED' },
    });
  });

  it('returns 409 for a duplicate non-cancelled linked prescription', async () => {
    mockPrisma.prescription.findFirst.mockResolvedValue({
      id: 'prescription-existing',
      prescriptionNumber: 'RX-EXISTING',
      appointmentId: 'appointment-1',
      consultationId: null,
    });
    const res = response();

    await createPrescription(
      request('DOCTOR', { appointmentId: 'appointment-1' }),
      res,
    );

    expect(mockPrisma.prescription.findFirst).toHaveBeenCalledWith({
      where: {
        status: { not: 'CANCELLED' },
        OR: [
          { appointmentId: 'appointment-1' },
          { consultation: { appointmentId: 'appointment-1' } },
        ],
      },
      select: expect.any(Object),
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.prescription.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported frequency text instead of calculating it as once daily', async () => {
    const req = request('DOCTOR', { appointmentId: 'appointment-1' });
    req.body.items[0].frequency = 'whenever suitable';
    const res = response();

    await createPrescription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects inactive medicines', async () => {
    mockPrisma.medicineCatalog.findMany.mockResolvedValue([]);
    const res = response();

    await createPrescription(
      request('DOCTOR', { appointmentId: 'appointment-1' }),
      res,
    );

    expect(mockPrisma.medicineCatalog.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['medicine-1'] }, isActive: true },
      select: { id: true, price: true },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.prescription.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate medicine lines at the API boundary', async () => {
    const req = request('DOCTOR', { appointmentId: 'appointment-1' });
    req.body.items.push({ ...req.body.items[0] });
    const res = response();

    await createPrescription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
