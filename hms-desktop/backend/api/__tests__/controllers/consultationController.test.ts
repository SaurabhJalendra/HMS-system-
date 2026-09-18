import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';

const mockPrisma = {
  appointment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  consultation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  prescription: {
    count: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  UserRole: {
    ADMIN: 'ADMIN',
    SUBADMIN: 'SUBADMIN',
    DOCTOR: 'DOCTOR',
  },
}));

jest.mock('../../utils/auditLogger', () => ({
  logAudit: jest.fn(),
}));

jest.mock('../../utils/hospitalHelper', () => ({
  resolveConsultationFee: jest.fn().mockResolvedValue(100),
}));

import {
  createConsultation,
  deleteConsultation,
  getConsultationById,
  getConsultations,
  updateConsultation,
} from '../../controllers/consultationController';

const response = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as unknown as Response;

const request = (
  role: 'DOCTOR' | 'ADMIN' | 'SUBADMIN',
  overrides: Partial<AuthRequest> = {},
) =>
  ({
    user: {
      id: 'doctor-own',
      username: 'doctor',
      fullName: 'Own Doctor',
      role,
    },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as unknown as AuthRequest;

describe('Consultation Controller OPD ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forces doctor list queries to the authenticated doctor', async () => {
    mockPrisma.consultation.findMany.mockResolvedValue([]);
    mockPrisma.consultation.count.mockResolvedValue(0);
    const req = request('DOCTOR', {
      query: { doctorId: 'doctor-other' },
    } as Partial<AuthRequest>);
    const res = response();

    await getConsultations(req, res);

    expect(mockPrisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { doctorId: 'doctor-own' } }),
    );
    expect(mockPrisma.consultation.count).toHaveBeenCalledWith({
      where: { doctorId: 'doctor-own' },
    });
  });

  it('preserves admin-level doctor query behavior', async () => {
    mockPrisma.consultation.findMany.mockResolvedValue([]);
    mockPrisma.consultation.count.mockResolvedValue(0);
    const req = request('SUBADMIN', {
      query: { doctorId: 'doctor-other' },
    } as Partial<AuthRequest>);

    await getConsultations(req, response());

    expect(mockPrisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { doctorId: 'doctor-other' } }),
    );
  });

  it('blocks a doctor from creating a consultation for another doctor', async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-other',
      doctor: { role: 'DOCTOR', consultationFee: 100 },
      patient: { id: 'patient-1' },
    });
    const req = request('DOCTOR', {
      body: {
        appointmentId: 'appointment-1',
        patientId: 'patient-1',
        doctorId: 'doctor-other',
        diagnosis: 'Diagnosis',
      },
    } as Partial<AuthRequest>);
    const res = response();

    await createConsultation(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.consultation.create).not.toHaveBeenCalled();
  });

  it('persists OPD vitals and keeps the appointment in progress until prescribing', async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-own',
      doctor: { role: 'DOCTOR', consultationFee: 100 },
      patient: { id: 'patient-1' },
    });
    mockPrisma.consultation.findFirst.mockResolvedValue(null);
    mockPrisma.consultation.create.mockResolvedValue({
      id: 'consultation-1',
      appointmentId: 'appointment-1',
    });
    mockPrisma.appointment.update.mockResolvedValue({ id: 'appointment-1' });
    const req = request('DOCTOR', {
      body: {
        appointmentId: 'appointment-1',
        patientId: 'patient-1',
        doctorId: 'doctor-own',
        diagnosis: 'Viral fever',
        temperature: 38.2,
        bloodPressure: '120/80',
        followUpDate: '2026-09-20',
      },
    } as Partial<AuthRequest>);
    const res = response();

    await createConsultation(req, res);

    expect(mockPrisma.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          temperature: 38.2,
          bloodPressure: '120/80',
          followUpDate: expect.any(Date),
        }),
      }),
    );
    expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { status: 'IN_PROGRESS' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects a hold time in the past', async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-own',
      doctor: { role: 'DOCTOR', consultationFee: 100 },
      patient: { id: 'patient-1' },
    });
    mockPrisma.consultation.findFirst.mockResolvedValue(null);
    const req = request('DOCTOR', {
      body: {
        appointmentId: 'appointment-1',
        patientId: 'patient-1',
        doctorId: 'doctor-own',
        diagnosis: 'Awaiting labs',
        heldUntil: '2020-01-01T10:00:00.000Z',
      },
    } as Partial<AuthRequest>);
    const res = response();

    await createConsultation(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.consultation.create).not.toHaveBeenCalled();
  });

  it.each([
    ['access', getConsultationById],
    ['update', updateConsultation],
    ['delete', deleteConsultation],
  ])('blocks a doctor from %s of another doctor consultation', async (_name, handler) => {
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: 'consultation-1',
      appointmentId: 'appointment-1',
      doctorId: 'doctor-other',
    });
    const req = request('DOCTOR', {
      params: { id: 'consultation-1' },
      body: { diagnosis: 'Updated' },
    } as Partial<AuthRequest>);
    const res = response();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.consultation.update).not.toHaveBeenCalled();
    expect(mockPrisma.consultation.delete).not.toHaveBeenCalled();
    expect(mockPrisma.prescription.count).not.toHaveBeenCalled();
  });
});
