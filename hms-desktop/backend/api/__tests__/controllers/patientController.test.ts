import { Response } from 'express';

const mockPrisma = {
  patient: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { PrismaClient } from '@prisma/client';
import { createPatient, updatePatient, getPatients } from '../../controllers/patientController';
import { AuthRequest } from '../../middleware/auth';

// Mock audit logger
jest.mock('../../utils/auditLogger', () => ({
  logAudit: jest.fn(),
}));

// Mock hospital helper
jest.mock('../../utils/hospitalHelper', () => ({
  getHospitalId: jest.fn(() => Promise.resolve('hospital-1')),
}));

describe('Patient Controller', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    // Reset mock functions between tests
    mockPrisma.patient.create.mockReset();
    mockPrisma.patient.update.mockReset();
    mockPrisma.patient.findMany.mockReset();
    mockPrisma.patient.findUnique.mockReset();
    mockPrisma.patient.count.mockReset();

    mockReq = {
      body: {},
      user: {
        id: 'user-1',
        username: 'testuser',
        role: 'DOCTOR' as any,
        fullName: 'Test User',
      },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPatient', () => {
    it('should create a patient with dateOfBirth', async () => {
      const patientData = {
        name: 'John Doe',
        dateOfBirth: '1990-01-15',
        gender: 'MALE',
        phone: '1234567890',
        address: '123 Main St',
      };

      mockReq.body = patientData;

      const mockCreatedPatient = {
        id: 'patient-1',
        ...patientData,
        dateOfBirth: new Date(patientData.dateOfBirth),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.patient.create.mockResolvedValue(mockCreatedPatient as any);

      await createPatient(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            patient: expect.objectContaining({
              name: 'John Doe',
            }),
          })
        })
      );
    });

    it('should create a patient with age (converts to dateOfBirth)', async () => {
      const patientData = {
        name: 'Jane Doe',
        age: 30,
        gender: 'FEMALE',
        phone: '0987654321',
        address: '456 Oak Ave',
      };

      mockReq.body = patientData;

      const mockCreatedPatient = {
        id: 'patient-2',
        name: patientData.name,
        dateOfBirth: expect.any(Date),
        gender: patientData.gender,
        phone: patientData.phone,
        address: patientData.address,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.patient.create.mockResolvedValue(mockCreatedPatient as any);

      await createPatient(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should reject patient creation without dateOfBirth or age', async () => {
      const patientData = {
        name: 'Invalid Patient',
        gender: 'MALE',
        phone: '1234567890',
        address: '123 Main St',
      };

      mockReq.body = patientData;

      await createPatient(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.create).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });

    it('should reject a phone number that is not exactly 10 digits', async () => {
      const patientData = {
        name: 'Phone Too Long',
        gender: 'MALE',
        phone: '12345678901',
        address: '123 Main St',
        age: 30,
      };

      mockReq.body = patientData;

      await createPatient(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.create).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate required fields', async () => {
      const patientData = {
        name: '',
        gender: 'MALE',
        phone: '123',
        address: '123 Main St',
        dateOfBirth: '1990-01-15',
      };

      mockReq.body = patientData;

      await createPatient(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.create).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updatePatient', () => {
    it('should update a patient successfully', async () => {
      const updateData = {
        name: 'John Updated',
        phone: '9999999999',
      };

      mockReq.body = updateData;
      mockReq.params = { id: 'patient-1' };

      const mockUpdatedPatient = {
        id: 'patient-1',
        name: 'John Updated',
        phone: '9999999999',
        updatedAt: new Date(),
      };

      // 1) Existing patient lookup by id
      mockPrisma.patient.findUnique
        .mockResolvedValueOnce({ id: 'patient-1', phone: '1111111111' } as any)
        // 2) Duplicate phone check
        .mockResolvedValueOnce(null);
      mockPrisma.patient.update.mockResolvedValue(mockUpdatedPatient as any);

      await updatePatient(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.update).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            patient: expect.objectContaining({ id: 'patient-1' }),
          }),
        })
      );
    });

    it('should return 404 for non-existent patient', async () => {
      mockReq.body = { name: 'Updated Name' };
      mockReq.params = { id: 'nonexistent' };

      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await updatePatient(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getPatients (search + pagination)', () => {
    it('should search patients by name', async () => {
      mockReq.query = { search: 'John' };

      const mockPatients = [
        { id: 'patient-1', name: 'John Doe', phone: '1234567890', dateOfBirth: new Date('1990-01-01'), gender: 'MALE' },
        { id: 'patient-2', name: 'John Smith', phone: '0987654321', dateOfBirth: new Date('1995-01-01'), gender: 'MALE' },
      ];

      mockPrisma.patient.findMany.mockResolvedValue(mockPatients as any);
      mockPrisma.patient.count.mockResolvedValue(2);

      await getPatients(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.findMany).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            patients: expect.arrayContaining([
              expect.objectContaining({ name: 'John Doe' }),
            ]),
            pagination: expect.any(Object),
          })
        })
      );
    });

    it('should paginate search results', async () => {
      mockReq.query = { search: 'John', page: '1', limit: '10' };

      mockPrisma.patient.findMany.mockResolvedValue([]);
      mockPrisma.patient.count.mockResolvedValue(0);

      await getPatients(mockReq as AuthRequest, mockRes as Response);

      expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
    });
  });
});





