import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';

const mockPrisma = {
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
  patient: { findUnique: jest.fn() },
  testCatalog: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  consultation: { findUnique: jest.fn() },
  appointment: { findUnique: jest.fn() },
  labTest: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  LabTestStatus: {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },
  UserRole: {
    ADMIN: 'ADMIN',
    DOCTOR: 'DOCTOR',
    RECEPTIONIST: 'RECEPTIONIST',
    LAB_TECH: 'LAB_TECH',
  },
}));

const mockLogAudit = jest.fn();
jest.mock('../../utils/auditLogger', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

import { createLabTest } from '../../controllers/labTestController';

function responseMock(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('createLabTest OPD safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));
    mockPrisma.$executeRaw.mockResolvedValue(1);
  });

  it('returns the existing non-cancelled test when a held visit is retried', async () => {
    const req = {
      user: { id: 'doctor-1', role: 'DOCTOR' },
      body: {
        patientId: 'patient-1',
        orderedBy: 'doctor-1',
        testCatalogId: 'test-1',
        consultationId: 'consultation-1',
        appointmentId: 'appointment-1',
      },
    } as unknown as AuthRequest;
    const res = responseMock();
    const existing = {
      id: 'lab-1',
      patientId: 'patient-1',
      testCatalogId: 'test-1',
      status: 'PENDING',
    };

    mockPrisma.patient.findUnique.mockResolvedValue({ id: 'patient-1' });
    mockPrisma.testCatalog.findUnique.mockResolvedValue({
      id: 'test-1',
      testName: 'CBC',
      isActive: true,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'doctor-1',
      role: 'DOCTOR',
      isActive: true,
    });
    mockPrisma.consultation.findUnique.mockResolvedValue({
      id: 'consultation-1',
      appointmentId: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-1',
    });
    mockPrisma.labTest.findFirst.mockResolvedValue(existing);

    await createLabTest(req, res);

    expect(mockPrisma.labTest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consultationId: 'consultation-1',
          patientId: 'patient-1',
          testCatalogId: 'test-1',
          status: { not: 'CANCELLED' },
        }),
      }),
    );
    expect(mockPrisma.labTest.create).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { labTest: existing, alreadyExisted: true },
      }),
    );
  });

  it('rejects a doctor placing an order under another account', async () => {
    const req = {
      user: { id: 'doctor-1', role: 'DOCTOR' },
      body: {
        patientId: 'patient-1',
        orderedBy: 'doctor-2',
        testCatalogId: 'test-1',
      },
    } as unknown as AuthRequest;
    const res = responseMock();

    await createLabTest(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.patient.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.labTest.create).not.toHaveBeenCalled();
  });
});
