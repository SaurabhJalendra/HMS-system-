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
  hospitalConfig: { findFirst: jest.fn() },
  labTestConfig: { findFirst: jest.fn() },
  technicianTestSelection: { findMany: jest.fn() },
  labTest: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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

import { createLabTest, updateLabTest } from '../../controllers/labTestController';

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
    mockPrisma.hospitalConfig.findFirst.mockResolvedValue({ labTestsEnabled: true });
    mockPrisma.labTestConfig.findFirst.mockResolvedValue(null);
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
          patientId: 'patient-1',
          testCatalogId: 'test-1',
          status: { not: 'CANCELLED' },
          OR: [
            { consultationId: 'consultation-1' },
            { appointmentId: 'appointment-1' },
          ],
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

  it('rejects orders attributed to a non-doctor user', async () => {
    const req = {
      user: { id: 'admin-1', role: 'ADMIN' },
      body: {
        patientId: 'patient-1',
        orderedBy: 'tech-1',
        testCatalogId: 'test-1',
      },
    } as unknown as AuthRequest;
    const res = responseMock();

    mockPrisma.patient.findUnique.mockResolvedValue({ id: 'patient-1' });
    mockPrisma.testCatalog.findUnique.mockResolvedValue({
      id: 'test-1',
      testName: 'CBC',
      isActive: true,
      category: 'General',
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'tech-1',
      role: 'LAB_TECH',
      isActive: true,
    });

    await createLabTest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.labTest.create).not.toHaveBeenCalled();
  });
});

describe('updateLabTest immutability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects changes to a completed lab test', async () => {
    const req = {
      user: { id: 'tech-1', role: 'LAB_TECH' },
      params: { id: 'lab-1' },
      body: { results: 'changed' },
    } as unknown as AuthRequest;
    const res = responseMock();

    mockPrisma.labTest.findUnique.mockResolvedValue({
      id: 'lab-1',
      status: 'COMPLETED',
      orderedBy: 'doctor-1',
      testCatalogId: 'test-1',
    });
    mockPrisma.technicianTestSelection.findMany.mockResolvedValue([
      { testCatalogId: 'test-1' },
    ]);

    await updateLabTest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.labTest.update).not.toHaveBeenCalled();
  });
});
