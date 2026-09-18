import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';

const mockPrisma = {
  medicineCatalog: {
    findMany: jest.fn(),
  },
  hospitalConfig: {
    findFirst: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  PrescriptionStatus: {
    ACTIVE: 'ACTIVE',
    DISPENSED: 'DISPENSED',
    CANCELLED: 'CANCELLED',
  },
}));

jest.mock('../../utils/auditLogger', () => ({
  logAudit: jest.fn(),
}));

jest.mock('../../utils/hospitalHelper', () => ({
  getRequiredHospitalId: jest.fn(),
}));

jest.mock('../../services/currencyService', () => ({
  getHospitalCurrencies: jest.fn(),
  convertCurrency: jest.fn(),
}));

import { getMedicines } from '../../controllers/medicineController';

describe('Medicine Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.hospitalConfig.findFirst.mockResolvedValue(null);
  });

  it('applies category with search before paginating medicines', async () => {
    const req = {
      query: {
        search: 'amox',
        category: 'Antibiotic',
        page: '1',
        limit: '20',
      },
    } as unknown as AuthRequest;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    mockPrisma.medicineCatalog.findMany.mockResolvedValue([
      {
        id: 'medicine-1',
        name: 'Amoxicillin',
        category: 'Antibiotic',
        price: 10,
        stockQuantity: 50,
        lowStockThreshold: 10,
      },
    ]);

    await getMedicines(req, res);

    expect(mockPrisma.medicineCatalog.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { name: { contains: 'amox', mode: 'insensitive' } },
          { genericName: { contains: 'amox', mode: 'insensitive' } },
          { code: { contains: 'amox', mode: 'insensitive' } },
        ],
        category: { equals: 'Antibiotic', mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          medicines: expect.arrayContaining([
            expect.objectContaining({ name: 'Amoxicillin' }),
          ]),
        }),
      }),
    );
  });
});
