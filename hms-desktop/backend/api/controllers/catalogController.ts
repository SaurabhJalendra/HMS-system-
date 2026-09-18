import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { randomUUID } from 'node:crypto';
import { logAudit } from '../utils/auditLogger';
import { decorateMedicinePack } from '../utils/medicinePack';

const prisma = new PrismaClient();

const cleanRequiredText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

// ========== ALLERGY CATALOG ==========

export const getAllAllergies = async (req: AuthRequest, res: Response) => {
  try {
    const allergies = await prisma.allergyCatalog.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: { allergies } });
  } catch (error: any) {
    console.error('Get allergies error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch allergies' });
  }
};

export const addAllergy = async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, category, description } = req.body;
    const normalizedName = cleanRequiredText(name);
    const normalizedDescription = cleanRequiredText(description);

    if (!normalizedName) {
      return res.status(400).json({ success: false, message: 'Allergy name is required' });
    }

    // Standardize and validate category to prevent drift
    const allowedCategories = ['Food', 'Drug', 'Environmental', 'Chemical', 'Biological'] as const;
    const normalizedCategory =
      typeof category === 'string'
        ? category.trim().toLowerCase()
        : '';

    const canonicalCategory =
      allowedCategories.find((c) => c.toLowerCase() === normalizedCategory) || null;

    if (!canonicalCategory) {
      return res.status(400).json({
        success: false,
        message: `Invalid allergy category. Allowed: ${allowedCategories.join(', ')}`,
      });
    }

    const existing = await prisma.allergyCatalog.findFirst({
      where: {
        name: { equals: normalizedName, mode: 'insensitive' },
        category: canonicalCategory,
        isActive: true,
      },
    });
    if (existing) {
      return res.json({ success: true, data: { allergy: existing } });
    }

    const allergy = await prisma.allergyCatalog.create({
      data: {
        code: cleanRequiredText(code) || `CUSTOM-ALLERGY-${randomUUID()}`,
        name: normalizedName,
        category: canonicalCategory,
        description: normalizedDescription || undefined,
        isActive: true,
      },
    });

    res.json({ success: true, data: { allergy } });
  } catch (error: any) {
    console.error('Add allergy error:', error);
    res.status(500).json({ success: false, message: 'Failed to add allergy' });
  }
};

// ========== CHRONIC CONDITION CATALOG ==========

export const getAllChronicConditions = async (req: AuthRequest, res: Response) => {
  try {
    const conditions = await prisma.chronicConditionCatalog.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: { conditions } });
  } catch (error: any) {
    console.error('Get chronic conditions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chronic conditions' });
  }
};

export const addChronicCondition = async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, category, icdCode, description } = req.body;
    const normalizedName = cleanRequiredText(name);
    const normalizedCategory = cleanRequiredText(category);

    if (!normalizedName || !normalizedCategory) {
      return res.status(400).json({
        success: false,
        message: 'Disease name and type are required',
      });
    }

    const existing = await prisma.chronicConditionCatalog.findFirst({
      where: {
        name: { equals: normalizedName, mode: 'insensitive' },
        category: { equals: normalizedCategory, mode: 'insensitive' },
        isActive: true,
      },
    });
    if (existing) {
      return res.json({ success: true, data: { condition: existing } });
    }

    const condition = await prisma.chronicConditionCatalog.create({
      data: {
        code: cleanRequiredText(code) || `CUSTOM-CONDITION-${randomUUID()}`,
        name: normalizedName,
        category: normalizedCategory,
        icdCode: cleanRequiredText(icdCode) || undefined,
        description: cleanRequiredText(description) || undefined,
        isActive: true,
      },
    });

    res.json({ success: true, data: { condition } });
  } catch (error: any) {
    console.error('Add chronic condition error:', error);
    res.status(500).json({ success: false, message: 'Failed to add chronic condition' });
  }
};

// ========== DIAGNOSIS CATALOG ==========

export const getAllDiagnoses = async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.query;
    
    const where = category ? { category: category as string, isActive: true } : { isActive: true };
    
    const diagnoses = await prisma.diagnosisCatalog.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: { diagnoses } });
  } catch (error: any) {
    console.error('Get diagnoses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch diagnoses' });
  }
};

export const addDiagnosis = async (req: AuthRequest, res: Response) => {
  try {
    const { icdCode, name, category } = req.body;

    const diagnosis = await prisma.diagnosisCatalog.create({
      data: { icdCode, name, category, isActive: true },
    });

    res.json({ success: true, data: { diagnosis } });
  } catch (error: any) {
    console.error('Add diagnosis error:', error);
    res.status(500).json({ success: false, message: 'Failed to add diagnosis' });
  }
};

// ========== MEDICINE CATALOG ==========

export const getAllMedicines = async (req: AuthRequest, res: Response) => {
  try {
    const { category, lowStock } = req.query;
    
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (lowStock === 'true') {
      where.stockQuantity = { lte: prisma.medicineCatalog.fields.lowStockThreshold };
    }
    
    const medicines = await prisma.medicineCatalog.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: { medicines: medicines.map((medicine) => decorateMedicinePack(medicine)) },
    });
  } catch (error: any) {
    console.error('Get medicines error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch medicines' });
  }
};

export const addMedicine = async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, genericName, manufacturer, category, therapeuticClass, atcCode, price, stockQuantity, lowStockThreshold } = req.body;

    const medicine = await prisma.medicineCatalog.create({
      data: { 
        code, 
        name, 
        genericName, 
        manufacturer, 
        category, 
        therapeuticClass, 
        atcCode, 
        price, 
        stockQuantity: stockQuantity || 0, 
        lowStockThreshold: lowStockThreshold || 10,
        isActive: true 
      },
    });

    res.json({ success: true, data: { medicine } });
  } catch (error: any) {
    console.error('Add medicine error:', error);
    res.status(500).json({ success: false, message: 'Failed to add medicine' });
  }
};

export const updateMedicineStock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const stockQuantity = Number(req.body?.stockQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return res.status(400).json({ success: false, message: 'stockQuantity must be a whole number of 0 or greater' });
    }

    const existing = await prisma.medicineCatalog.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    const medicine = await prisma.medicineCatalog.update({
      where: { id },
      data: { stockQuantity },
    });

    if (req.user?.id) {
      await logAudit({
        userId: req.user.id,
        action: 'UPDATE_MEDICINE_STOCK',
        tableName: 'medicine_catalog',
        recordId: id,
        oldValue: { stockQuantity: existing.stockQuantity },
        newValue: { stockQuantity },
      });
    }

    res.json({ success: true, data: { medicine: decorateMedicinePack(medicine) } });
  } catch (error: any) {
    console.error('Update medicine stock error:', error);
    res.status(500).json({ success: false, message: 'Failed to update medicine stock' });
  }
};

// ========== PATIENT ALLERGIES ==========

export const getPatientAllergies = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;

    const allergies = await prisma.patientAllergy.findMany({
      where: { patientId },
      include: { allergy: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { allergies } });
  } catch (error: any) {
    console.error('Get patient allergies error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient allergies' });
  }
};

export const addPatientAllergy = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const { allergyId, severity, onsetDate, notes } = req.body;

    const allergy = await prisma.patientAllergy.create({
      data: { 
        patientId, 
        allergyId, 
        severity: severity || 'Unknown',
        onsetDate: onsetDate ? new Date(onsetDate) : null,
        notes 
      },
      include: { allergy: true },
    });

    res.json({ success: true, data: { allergy } });
  } catch (error: any) {
    console.error('Add patient allergy error:', error);
    res.status(500).json({ success: false, message: 'Failed to add patient allergy' });
  }
};

export const deletePatientAllergy = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.patientAllergy.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Allergy removed successfully' });
  } catch (error: any) {
    console.error('Delete patient allergy error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove allergy' });
  }
};

// ========== PATIENT CHRONIC CONDITIONS ==========

export const getPatientChronicConditions = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;

    const conditions = await prisma.patientChronicCondition.findMany({
      where: { patientId },
      include: { condition: true },
      orderBy: { diagnosisDate: 'desc' },
    });

    res.json({ success: true, data: { conditions } });
  } catch (error: any) {
    console.error('Get patient chronic conditions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient chronic conditions' });
  }
};

export const addPatientChronicCondition = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const { conditionId, diagnosisDate, currentStatus, notes } = req.body;

    const condition = await prisma.patientChronicCondition.create({
      data: { 
        patientId, 
        conditionId,
        diagnosisDate: new Date(diagnosisDate),
        currentStatus: currentStatus || 'Active',
        notes 
      },
      include: { condition: true },
    });

    res.json({ success: true, data: { condition } });
  } catch (error: any) {
    console.error('Add patient chronic condition error:', error);
    res.status(500).json({ success: false, message: 'Failed to add chronic condition' });
  }
};

export const deletePatientChronicCondition = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.patientChronicCondition.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Chronic condition removed successfully' });
  } catch (error: any) {
    console.error('Delete patient chronic condition error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove chronic condition' });
  }
};

