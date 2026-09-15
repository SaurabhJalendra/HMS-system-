import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';

const mockPrisma = {
  allergyCatalog: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  chronicConditionCatalog: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { addAllergy, addChronicCondition } from '../../controllers/catalogController';

describe('custom catalog entries', () => {
  let req: Partial<AuthRequest>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it('creates a custom allergy with a generated code', async () => {
    req.body = {
      name: 'Custom pollen reaction',
      category: 'Environmental',
      description: 'Exposure to local tree pollen',
    };
    mockPrisma.allergyCatalog.findFirst.mockResolvedValue(null);
    mockPrisma.allergyCatalog.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'allergy-1', ...data })
    );

    await addAllergy(req as AuthRequest, res as Response);

    expect(mockPrisma.allergyCatalog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: expect.stringMatching(/^CUSTOM-ALLERGY-/),
        name: 'Custom pollen reaction',
        category: 'Environmental',
        description: 'Exposure to local tree pollen',
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('reuses an existing allergy with the same name and type', async () => {
    const existing = {
      id: 'allergy-existing',
      code: 'ALG-1',
      name: 'Pollen',
      category: 'Environmental',
      isActive: true,
    };
    req.body = { name: ' pollen ', category: 'environmental' };
    mockPrisma.allergyCatalog.findFirst.mockResolvedValue(existing);

    await addAllergy(req as AuthRequest, res as Response);

    expect(mockPrisma.allergyCatalog.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { allergy: existing },
    });
  });

  it('creates a custom chronic condition with a generated code', async () => {
    req.body = { name: 'Custom airway disease', category: 'Respiratory' };
    mockPrisma.chronicConditionCatalog.findFirst.mockResolvedValue(null);
    mockPrisma.chronicConditionCatalog.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'condition-1', ...data })
    );

    await addChronicCondition(req as AuthRequest, res as Response);

    expect(mockPrisma.chronicConditionCatalog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: expect.stringMatching(/^CUSTOM-CONDITION-/),
        name: 'Custom airway disease',
        category: 'Respiratory',
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});
