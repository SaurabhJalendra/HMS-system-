import { Response } from 'express';
import { logAudit } from '../utils/auditLogger';
import { PrismaClient, PrescriptionStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { computeUnitsToDispenseForLine } from '../utils/prescriptionDispenseUnits';
import { FileParserService } from '../services/fileParserService';
import { getRequiredHospitalId } from '../utils/hospitalHelper';
import { getHospitalCurrencies, convertCurrency } from '../services/currencyService';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Validation schemas
const medicineCreateSchema = z.object({
  name: z.string().min(1, 'Medicine name is required').max(200, 'Medicine name too long'),
  genericName: z.string().max(200, 'Generic name too long').optional(),
  manufacturer: z.string().max(200, 'Manufacturer name too long').optional(),
  category: z.string().max(100, 'Category too long').optional(),
  therapeuticClass: z.string().max(200, 'Therapeutic class too long').optional(),
  atcCode: z.string().max(50, 'ATC code too long').optional(),
  code: z.string().max(100, 'Code too long').optional(),
  description: z.string().max(1000, 'Description too long').optional(),
  dosageForm: z.string().max(100, 'Dosage form too long').optional(),
  strength: z.string().max(100, 'Strength too long').optional(),
  unit: z.string().max(50, 'Unit too long').optional(),
  expiryDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  supplier: z.string().max(200, 'Supplier name too long').optional(),
  batchNumber: z.string().max(100, 'Batch number too long').optional(),
  storageConditions: z.string().max(500, 'Storage conditions too long').optional(),
  prescriptionRequired: z.boolean().optional(),
  quantity: z.union([z.number().int().min(0), z.string()]).transform(val => typeof val === 'string' ? parseInt(val) || 0 : val).pipe(z.number().int().min(0, 'Quantity must be non-negative')),
  price: z.union([z.number().positive(), z.string()]).transform(val => typeof val === 'string' ? parseFloat(val) || 0 : val).pipe(z.number().positive('Price must be positive')),
  lowStockThreshold: z.union([z.number().int().min(0), z.string()]).transform(val => typeof val === 'string' ? parseInt(val) || 10 : val).pipe(z.number().int().min(0, 'Low stock threshold must be non-negative')).optional(),
});

/** JSON clients often send `null` for empty fields; Zod `.optional()` expects `undefined`, not `null`. */
function stripNullBodyFields(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, v === null ? undefined : v])
  );
}

const medicineUpdateSchema = z.preprocess(
  stripNullBodyFields,
  z.object({
    name: z.string().min(1, 'Medicine name is required').max(200, 'Medicine name too long').optional(),
    genericName: z.string().max(200, 'Generic name too long').optional(),
    manufacturer: z.string().max(200, 'Manufacturer name too long').optional(),
    category: z.string().max(100, 'Category too long').optional(),
    therapeuticClass: z.string().max(200, 'Therapeutic class too long').optional(),
    atcCode: z.string().max(50, 'ATC code too long').optional(),
    code: z.string().max(100, 'Code too long').optional(),
    description: z.string().max(1000, 'Description too long').optional(),
    dosageForm: z.string().max(100, 'Dosage form too long').optional(),
    strength: z.string().max(100, 'Strength too long').optional(),
    unit: z.string().max(50, 'Unit too long').optional(),
    expiryDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    supplier: z.string().max(200, 'Supplier name too long').optional(),
    batchNumber: z.string().max(100, 'Batch number too long').optional(),
    storageConditions: z.string().max(500, 'Storage conditions too long').optional(),
    prescriptionRequired: z.boolean().optional(),
    quantity: z.union([z.number().int().min(0), z.string()]).transform(val => typeof val === 'string' ? parseInt(val) || 0 : val).pipe(z.number().int().min(0, 'Quantity must be non-negative')).optional(),
    price: z.union([z.number().positive(), z.string()]).transform(val => typeof val === 'string' ? parseFloat(val) || 0 : val).pipe(z.number().positive('Price must be positive')).optional(),
    lowStockThreshold: z.union([z.number().int().min(0), z.string()]).transform(val => typeof val === 'string' ? parseInt(val) || 10 : val).pipe(z.number().int().min(0, 'Low stock threshold must be non-negative')).optional(),
  })
);

const medicineSearchSchema = z.object({
  search: z.string().optional(),
  lowStock: z.string().transform(val => val === 'true').optional(),
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => parseInt(val) || 20).optional(),
});

const stockUpdateSchema = z.preprocess(
  stripNullBodyFields,
  z.object({
    quantity: z.coerce.number().int(),
    operation: z.enum(['add', 'subtract', 'set']),
    reason: z.string().optional(),
  })
);

// Create new medicine
export const createMedicine = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = medicineCreateSchema.parse(req.body);

    // Generate unique code for medicine
    const code = `MED${Date.now().toString().slice(-8)}`;

    // Check if medicine already exists
    const existingMedicine = await prisma.medicineCatalog.findFirst({
      where: {
        OR: [
          { name: validatedData.name },
          { code: code }
        ]
      },
    });

    if (existingMedicine) {
      return res.status(400).json({
        success: false,
        message: 'Medicine with this name already exists',
      });
    }

    // Create medicine in MedicineCatalog
    const medicine = await prisma.medicineCatalog.create({
      data: {
        code: validatedData.code || code,
        name: validatedData.name,
        genericName: validatedData.genericName || validatedData.name, // Use provided generic name or fallback to name
        manufacturer: validatedData.manufacturer || null,
        category: validatedData.category || 'General',
        therapeuticClass: validatedData.therapeuticClass || null,
        atcCode: validatedData.atcCode || null,
        price: validatedData.price,
        stockQuantity: validatedData.quantity ?? 0,
        lowStockThreshold: validatedData.lowStockThreshold ?? 10,
        expiryDate: validatedData.expiryDate || null,
        isActive: true,
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_MEDICINE',
      tableName: 'medicines',
      recordId: medicine.id,
      newValue: medicine,
    });

    res.status(201).json({
      success: true,
      message: 'Medicine created successfully',
      data: { medicine },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Create medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all medicines with search and pagination
export const getMedicines = async (req: AuthRequest, res: Response) => {
  try {
    const { search, lowStock, page = 1, limit = 20 } = medicineSearchSchema.parse(req.query);

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      isActive: true, // Only get active medicines
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get all medicines first (needed for lowStock filtering)
    let medicines = await prisma.medicineCatalog.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    // Apply lowStock filter in memory if requested
    // Prisma doesn't support comparing two fields directly in where clause
    if (lowStock) {
      medicines = medicines.filter(
        medicine => medicine.stockQuantity <= medicine.lowStockThreshold
      );
    }

    // Get total count after filtering
    const total = medicines.length;

    // Apply pagination
    const paginatedMedicines = medicines.slice(skip, skip + limit);

    // Get hospital config for markup percentage
    const hospitalConfig = await prisma.hospitalConfig.findFirst();
    const markupPercentage = hospitalConfig?.medicineMarkupPercentage ? Number(hospitalConfig.medicineMarkupPercentage) : 0;

    // Add stock status and apply markup to prices
    const medicinesWithStatus = paginatedMedicines.map(medicine => {
      const basePrice = Number(medicine.price);
      const sellingPrice = markupPercentage > 0
        ? basePrice * (1 + markupPercentage / 100)
        : basePrice;

      return {
        ...medicine,
        price: basePrice, // Keep base price
        sellingPrice: sellingPrice, // Add selling price with markup
        stockStatus: medicine.stockQuantity <= medicine.lowStockThreshold ? 'LOW' : 'OK',
      };
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        medicines: medicinesWithStatus,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Get medicines error:', error);
    console.error('Error details:', error?.message, error?.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error?.message || 'Unknown error',
    });
  }
};

// Get medicine by ID
export const getMedicineById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const medicine = await prisma.medicineCatalog.findUnique({
      where: { id },
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    // Get hospital config for markup percentage
    const hospitalConfig = await prisma.hospitalConfig.findFirst();
    const markupPercentage = hospitalConfig?.medicineMarkupPercentage ? Number(hospitalConfig.medicineMarkupPercentage) : 0;

    const basePrice = Number(medicine.price);
    const sellingPrice = markupPercentage > 0
      ? basePrice * (1 + markupPercentage / 100)
      : basePrice;

    // Add stock status and apply markup to price
    const medicineWithStatus = {
      ...medicine,
      price: basePrice, // Keep base price
      sellingPrice: sellingPrice, // Add selling price with markup
      stockStatus: medicine.stockQuantity <= medicine.lowStockThreshold ? 'LOW' : 'OK',
    };

    res.json({
      success: true,
      data: { medicine: medicineWithStatus },
    });
  } catch (error) {
    console.error('Get medicine by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update medicine
export const updateMedicine = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = medicineUpdateSchema.parse(req.body);

    // Check if medicine exists
    const existingMedicine = await prisma.medicineCatalog.findUnique({
      where: { id },
    });

    if (!existingMedicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    // Check for duplicate name if name is being updated
    if (validatedData.name && validatedData.name !== existingMedicine.name) {
      const duplicateMedicine = await prisma.medicineCatalog.findFirst({
        where: {
          name: validatedData.name,
          id: { not: id }
        },
      });

      if (duplicateMedicine) {
        return res.status(400).json({
          success: false,
          message: 'Medicine with this name already exists',
        });
      }
    }

    // Prepare update data - only include fields that are provided
    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.genericName !== undefined) updateData.genericName = validatedData.genericName;
    if (validatedData.manufacturer !== undefined) updateData.manufacturer = validatedData.manufacturer;
    if (validatedData.category !== undefined) updateData.category = validatedData.category;
    if (validatedData.therapeuticClass !== undefined) updateData.therapeuticClass = validatedData.therapeuticClass;
    if (validatedData.atcCode !== undefined) updateData.atcCode = validatedData.atcCode;
    if (validatedData.code !== undefined) updateData.code = validatedData.code;
    if (validatedData.price !== undefined) updateData.price = validatedData.price;
    if (validatedData.quantity !== undefined) updateData.stockQuantity = validatedData.quantity;
    if (validatedData.lowStockThreshold !== undefined) updateData.lowStockThreshold = validatedData.lowStockThreshold;
    if (validatedData.expiryDate !== undefined) updateData.expiryDate = validatedData.expiryDate;

    // Update medicine
    const updatedMedicine = await prisma.medicineCatalog.update({
      where: { id },
      data: updateData,
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_MEDICINE',
      tableName: 'medicines',
      recordId: id,
      oldValue: existingMedicine,
      newValue: updatedMedicine,
    });

    res.json({
      success: true,
      message: 'Medicine updated successfully',
      data: { medicine: updatedMedicine },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Update medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update medicine stock
export const updateMedicineStock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = stockUpdateSchema.parse(req.body);

    // Check if medicine exists
    const existingMedicine = await prisma.medicineCatalog.findUnique({
      where: { id },
    });

    if (!existingMedicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    let newQuantity: number;
    const { quantity, operation, reason } = validatedData;

    switch (operation) {
      case 'add':
        newQuantity = existingMedicine.stockQuantity + quantity;
        break;
      case 'subtract':
        newQuantity = Math.max(0, existingMedicine.stockQuantity - quantity);
        break;
      case 'set':
        newQuantity = Math.max(0, quantity);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid operation',
        });
    }

    // Update medicine quantity
    const updatedMedicine = await prisma.medicineCatalog.update({
      where: { id },
      data: { stockQuantity: newQuantity },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_MEDICINE_STOCK',
      tableName: 'medicine_catalog',
      recordId: id,
      oldValue: { stockQuantity: existingMedicine.stockQuantity },
      newValue: { stockQuantity: newQuantity, operation, reason },
    });

    res.json({
      success: true,
      message: 'Medicine stock updated successfully',
      data: {
        medicine: updatedMedicine,
        operation: {
          type: operation,
          quantity: quantity,
          reason: reason,
          oldQuantity: existingMedicine.stockQuantity,
          newQuantity: newQuantity,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Update medicine stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete medicine
export const deleteMedicine = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if medicine exists
    const existingMedicine = await prisma.medicineCatalog.findUnique({
      where: { id },
    });

    if (!existingMedicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    // Check if medicine has transactions
    const transactions = await prisma.medicineTransaction.count({
      where: { medicineId: id },
    });

    if (transactions > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete medicine with existing transactions',
        data: { transactions },
      });
    }

    // Delete medicine (soft delete by setting isActive to false)
    await prisma.medicineCatalog.update({
      where: { id },
      data: { isActive: false },
    });

    // Log the action (with error handling to prevent deletion failure)
    try {
      await logAudit({
        userId: req.user!.id,
        action: 'DELETE_MEDICINE',
        tableName: 'medicines',
        recordId: id,
        oldValue: existingMedicine,
      });
    } catch (auditError) {
      console.warn('Failed to create audit log for medicine deletion:', auditError);
      // Don't fail the deletion if audit log creation fails
    }

    res.json({
      success: true,
      message: 'Medicine deleted successfully',
    });
  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get medicine statistics
export const getMedicineStats = async (req: AuthRequest, res: Response) => {
  try {
    // Get all medicines to calculate low stock and total value
    const allMedicines = await prisma.medicineCatalog.findMany({
      where: { isActive: true },
      select: { stockQuantity: true, price: true, lowStockThreshold: true },
    });

    const [
      totalMedicines,
      recentTransactions,
      totalQuantity,
    ] = await Promise.all([
      prisma.medicineCatalog.count({ where: { isActive: true } }),
      prisma.medicineTransaction.count({
        where: {
          dispensedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      prisma.medicineCatalog.aggregate({
        where: { isActive: true },
        _sum: { stockQuantity: true },
      }),
    ]);

    // Calculate low stock medicines
    const lowStockMedicines = allMedicines.filter(
      medicine => medicine.stockQuantity <= medicine.lowStockThreshold
    ).length;

    // Calculate total inventory value
    const totalInventoryValue = allMedicines.reduce((total, medicine) => {
      return total + (medicine.stockQuantity * Number(medicine.price));
    }, 0);

    res.json({
      success: true,
      data: {
        totalMedicines,
        lowStockMedicines,
        totalInventoryValue,
        recentTransactions,
        totalQuantity: totalQuantity._sum.stockQuantity || 0,
      },
    });
  } catch (error) {
    console.error('Get medicine stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get low stock medicines
export const getLowStockMedicines = async (req: AuthRequest, res: Response) => {
  try {
    // Get all medicines and filter for low stock
    const allMedicines = await prisma.medicineCatalog.findMany({
      where: { isActive: true },
      orderBy: { stockQuantity: 'asc' },
    });

    const lowStockMedicines = allMedicines.filter(
      medicine => medicine.stockQuantity <= medicine.lowStockThreshold
    );

    // Add stock status
    const medicinesWithStatus = lowStockMedicines.map(medicine => ({
      ...medicine,
      stockStatus: 'LOW' as const,
    }));

    res.json({
      success: true,
      data: { medicines: medicinesWithStatus },
    });
  } catch (error) {
    console.error('Get low stock medicines error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Align catalog stock with DISPENSED prescriptions: for each medicine on each dispensed Rx,
 * expected units = sum of line-item calculations; compare to sum of MedicineTransaction for that Rx.
 * Positive gap → decrement stock and insert a catch-up transaction (idempotent for already-synced Rx).
 */
export const reconcileStockFromDispensedPrescriptions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const prescriptionId =
      typeof req.body?.prescriptionId === 'string' ? req.body.prescriptionId.trim() : '';

    const where: { status: PrescriptionStatus; id?: string } = {
      status: PrescriptionStatus.DISPENSED,
    };
    if (prescriptionId) {
      where.id = prescriptionId;
    }

    const prescriptions = await prisma.prescription.findMany({
      where,
      select: {
        id: true,
        prescriptionNumber: true,
        dispensedBy: true,
        prescriptionItems: {
          select: {
            medicineId: true,
            quantity: true,
            frequency: true,
            duration: true,
          },
        },
      },
    });

    if (prescriptionId && prescriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dispensed prescription not found',
      });
    }

    const applied: Array<{
      prescriptionId: string;
      prescriptionNumber: string;
      medicineId: string;
      medicineName: string;
      unitsAdjusted: number;
    }> = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const p of prescriptions) {
      if (!p.prescriptionItems.length) continue;

      const expectedByMedicine = new Map<string, number>();
      for (const item of p.prescriptionItems) {
        const u = computeUnitsToDispenseForLine(item);
        expectedByMedicine.set(item.medicineId, (expectedByMedicine.get(item.medicineId) || 0) + u);
      }

      const txns = await prisma.medicineTransaction.findMany({
        where: { prescriptionId: p.id },
        select: { medicineId: true, quantityDispensed: true },
      });
      const loggedByMedicine = new Map<string, number>();
      for (const t of txns) {
        loggedByMedicine.set(
          t.medicineId,
          (loggedByMedicine.get(t.medicineId) || 0) + t.quantityDispensed,
        );
      }

      const dispenser = p.dispensedBy || userId;

      for (const [medicineId, expected] of expectedByMedicine) {
        const logged = loggedByMedicine.get(medicineId) || 0;
        const gap = expected - logged;
        if (gap === 0) continue;

        if (gap < 0) {
          const med = await prisma.medicineCatalog.findUnique({
            where: { id: medicineId },
            select: { name: true },
          });
          warnings.push(
            `${p.prescriptionNumber} — ${med?.name || medicineId}: transaction log shows ${logged} units but prescription lines imply ${expected}; stock not changed.`,
          );
          continue;
        }

        try {
          await prisma.$transaction(async (tx) => {
            const updated = await tx.medicineCatalog.updateMany({
              where: { id: medicineId, stockQuantity: { gte: gap } },
              data: { stockQuantity: { decrement: gap } },
            });
            if (updated.count !== 1) {
              const med = await tx.medicineCatalog.findUnique({
                where: { id: medicineId },
                select: { name: true, stockQuantity: true },
              });
              throw new Error(
                `Insufficient stock for ${p.prescriptionNumber} — ${med?.name || medicineId}: need ${gap} more units, have ${med?.stockQuantity ?? 0}.`,
              );
            }
            await tx.medicineTransaction.create({
              data: {
                prescriptionId: p.id,
                medicineId,
                quantityDispensed: gap,
                dispensedBy: dispenser,
              },
            });
          });

          const med = await prisma.medicineCatalog.findUnique({
            where: { id: medicineId },
            select: { name: true },
          });
          applied.push({
            prescriptionId: p.id,
            prescriptionNumber: p.prescriptionNumber,
            medicineId,
            medicineName: med?.name || medicineId,
            unitsAdjusted: gap,
          });
        } catch (e: any) {
          errors.push(e?.message || String(e));
        }
      }
    }

    await logAudit({
      userId,
      action: 'RECONCILE_DISPENSED_STOCK',
      tableName: 'medicine_catalog',
      recordId: prescriptionId || 'ALL',
      newValue: {
        adjustments: applied.length,
        prescriptionFilter: prescriptionId || null,
      },
    });

    let message = 'Inventory already matches dispensed prescriptions (no gaps).';
    if (errors.length > 0 && applied.length === 0) {
      message = 'No stock changes applied; fix errors below (e.g. insufficient stock) and retry.';
    } else if (applied.length > 0) {
      message = `Applied ${applied.length} stock adjustment(s) from dispensed prescriptions.`;
      if (errors.length > 0) message += ' Some items failed — see errors.';
    } else if (warnings.length > 0) {
      message = 'No stock changes needed; see warnings for transaction vs prescription mismatches.';
    }

    res.json({
      success: true,
      message,
      data: { applied, warnings, errors },
    });
  } catch (error) {
    console.error('Reconcile dispensed stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reconcile stock from dispensed prescriptions',
    });
  }
};

// Get medicine transactions
export const getMedicineTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const { medicineId, page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (medicineId) {
      where.medicineId = medicineId as string;
    }

    const [transactions, total] = await Promise.all([
      prisma.medicineTransaction.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { dispensedAt: 'desc' },
        include: {
          medicine: {
            select: {
              id: true,
              name: true,
              price: true,
            },
          },
          prescription: {
            select: {
              id: true,
              patient: {
                select: { name: true },
              },
              doctor: {
                select: { fullName: true },
              },
            },
          },
          dispensedByUser: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      prisma.medicineTransaction.count({ where }),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalItems: total,
          itemsPerPage: Number(limit),
          hasNextPage: Number(page) < totalPages,
          hasPrevPage: Number(page) > 1,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// New validation schemas for enhanced functionality
const newOrderMedicineSchema = z.object({
  name: z.string().trim().min(1, 'Medicine name is required').max(200),
  genericName: z.string().trim().min(1, 'Generic name is required').max(200),
  manufacturer: z.string().trim().min(1, 'Manufacturer is required').max(200),
  category: z.string().trim().min(1, 'Category is required').max(100),
  code: z.string().trim().max(100).optional(),
  lowStockThreshold: z.coerce.number().int().min(0, 'Low stock threshold must be non-negative'),
});

const orderItemSchema = z.object({
  source: z.enum(['inventory', 'new']).default('inventory'),
  medicineId: z.string().optional(),
  newMedicine: newOrderMedicineSchema.optional(),
  quantity: z.coerce.number().int().positive('Quantity must be positive'),
  unitPrice: z.coerce.number().positive('Unit price must be positive'),
}).superRefine((item, context) => {
  if (item.source === 'inventory' && !item.medicineId?.trim()) {
    context.addIssue({ code: 'custom', path: ['medicineId'], message: 'Select a medicine from inventory' });
  }
  if (item.source === 'new' && !item.newMedicine) {
    context.addIssue({ code: 'custom', path: ['newMedicine'], message: 'Enter the new medicine details' });
  }
});

const orderCreateSchema = z.object({
  supplierId: z.string().min(1, 'Supplier ID is required'),
  orderItems: z.array(orderItemSchema).min(1, 'At least one order item is required'),
  expectedDelivery: z.string().optional(),
  notes: z.string().optional(),
});

const orderStatusUpdateSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  actualDelivery: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceFile: z.string().optional(),
});

const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(200),
  address: z.string().trim().max(500).optional(),
  contact: z.string().trim().max(100).optional(),
  email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
  gstNumber: z.string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(
      z.string().regex(
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
        'GST number must be a valid 15-character GSTIN',
      ),
    ),
});

// Import medicine catalog from file
export const importMedicineCatalog = async (req: AuthRequest, res: Response) => {
  let filePath: string | undefined;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select an Excel file to import.'
      });
    }

    filePath = req.file.path;
    const fileType = req.file.mimetype;
    const extension = path.extname(req.file.originalname || '').toLowerCase();

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream', // Some desktop clients do not provide an Excel MIME type.
    ];

    if (!allowedTypes.includes(fileType) || !['.xlsx', '.xls'].includes(extension)) {
      // Clean up file
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: `Unsupported file type: ${fileType}. Please upload an Excel file (.xlsx or .xls).`
      });
    }

    // Parse the file
    let parsedMedicines;
    try {
      console.log('Starting file parse for:', filePath, 'Type:', fileType);
      parsedMedicines = await FileParserService.parseFile(filePath, fileType);
      console.log('Parsed medicines count:', parsedMedicines ? parsedMedicines.length : 0);
      if (parsedMedicines && parsedMedicines.length > 0) {
        console.log('First parsed medicine sample:', JSON.stringify(parsedMedicines[0], null, 2));
      }
    } catch (parseError: any) {
      console.error('File parsing error:', parseError);
      console.error('Error stack:', parseError.stack);
      // Clean up file
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: `Failed to parse file: ${parseError.message || 'Invalid file format'}. Please ensure the file is a valid Excel file with proper column headers.`
      });
    }

    if (!parsedMedicines || parsedMedicines.length === 0) {
      console.error('No medicines parsed from file. File path:', filePath);
      // Clean up file
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: 'No data found in file. Please ensure the Excel file contains medicine data with proper column headers. Check the backend console for detailed error messages.'
      });
    }

    // Get hospital ID (required for multi-tenancy)
    let hospitalId: string;
    let baseCurrency: string;
    try {
      hospitalId = await getRequiredHospitalId();
      console.log('Using hospital ID for import:', hospitalId);

      // Verify the hospital config exists in database
      const hospitalExists = await prisma.hospitalConfig.findUnique({
        where: { id: hospitalId },
        select: { id: true }
      });

      if (!hospitalExists) {
        throw new Error(`Hospital with ID ${hospitalId} does not exist in database`);
      }

      // Get hospital base currency for price conversion
      const currencies = await getHospitalCurrencies();
      baseCurrency = currencies.baseCurrency || 'USD';
      console.log('Hospital base currency for import:', baseCurrency);
    } catch (error: any) {
      console.error('Failed to get hospital ID:', error);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(500).json({
        success: false,
        message: `Hospital configuration error: ${error.message || 'Hospital configuration not found. Please configure hospital settings first.'}`
      });
    }

    // Validate and save medicines
    const savedMedicines = [];
    const errors = [];
    const importedMedicineNames = new Set<string>(); // Track which medicines are in the import file
    const importedMedicineIds = new Set<string>(); // Track which medicine IDs were processed

    console.log(`Starting import of ${parsedMedicines.length} medicines for hospital ${hospitalId}`);

    // First pass: Process all medicines from import file
    for (let i = 0; i < parsedMedicines.length; i++) {
      const medicineData = parsedMedicines[i];
      try {
        // Validate required fields
        if (!medicineData.name || medicineData.name.trim().length === 0) {
          errors.push(`Row ${i + 2}: Skipped - Missing medicine name`);
          continue;
        }

        // Track this medicine name (case-insensitive for matching)
        importedMedicineNames.add(medicineData.name.trim().toLowerCase());

        // Check if medicine already exists (by name and hospital)
        const existingMedicine = await prisma.medicineCatalog.findFirst({
          where: {
            name: {
              equals: medicineData.name.trim(),
              mode: 'insensitive'
            },
            hospitalId: hospitalId
          }
        });

        let savedMedicine;

        if (existingMedicine) {
          // Update existing medicine - REPLACE with new data from import file
          console.log(`Updating existing medicine: ${medicineData.name} (ID: ${existingMedicine.id})`);
          console.log('Import data:', JSON.stringify(medicineData, null, 2));
          console.log('Existing data:', JSON.stringify({
            stockQuantity: existingMedicine.stockQuantity,
            price: existingMedicine.price,
            category: existingMedicine.category
          }, null, 2));

          // Build update data object - REPLACE all fields with new values from import
          const updateData: any = {
            name: medicineData.name.trim(), // Always update name (required field)
            hospitalId: hospitalId, // Always include hospitalId
            isActive: true, // Always set to active when importing
          };

          // Replace ALL fields with new values from import (even if empty/null)
          // Generic Name: Replace with new value (null if empty)
          updateData.genericName = (medicineData.genericName && medicineData.genericName.trim()) 
            ? medicineData.genericName.trim() 
            : null;

          // Manufacturer: Replace with new value (null if empty)
          updateData.manufacturer = (medicineData.manufacturer && medicineData.manufacturer.trim()) 
            ? medicineData.manufacturer.trim() 
            : null;

          // Category: Replace with new value (default to 'General' if empty)
          updateData.category = (medicineData.category && medicineData.category.trim()) 
            ? medicineData.category.trim() 
            : 'General';

          // Therapeutic Class: Replace with new value (null if empty)
          updateData.therapeuticClass = (medicineData.therapeuticClass && medicineData.therapeuticClass.trim()) 
            ? medicineData.therapeuticClass.trim() 
            : null;

          // ATC Code: Replace with new value (null if empty)
          updateData.atcCode = (medicineData.atcCode && medicineData.atcCode.trim()) 
            ? medicineData.atcCode.trim() 
            : null;

          // Price: REPLACE with new value from import (use 0 if not provided or invalid)
          // Convert to base currency if import file has different currency
          let newPrice = medicineData.price !== undefined && medicineData.price !== null 
            ? (typeof medicineData.price === 'number' ? medicineData.price : parseFloat(medicineData.price) || 0)
            : 0;
          
          // Detect import file currency from price column header or assume from file
          // Common patterns: "Price(INR)", "Price (USD)", "Price in INR", etc.
          const importCurrency = medicineData.currency || 
            (medicineData.priceColumnHeader?.match(/\(([A-Z]{3})\)/i)?.[1]?.toUpperCase()) ||
            'USD'; // Default to USD if not detected
          
          // Convert to base currency if different
          if (newPrice > 0 && baseCurrency && importCurrency !== baseCurrency) {
            try {
              console.log(`Converting price ${newPrice} from ${importCurrency} to ${baseCurrency}`);
              const convertedPrice = await convertCurrency(newPrice, importCurrency, baseCurrency);
              if (convertedPrice !== null && convertedPrice > 0) {
                newPrice = convertedPrice;
                console.log(`Converted price: ${newPrice} ${baseCurrency}`);
              } else {
                console.warn(`Currency conversion failed for ${newPrice} ${importCurrency} to ${baseCurrency}, using original price`);
              }
            } catch (conversionError: any) {
              console.warn(`Error converting currency: ${conversionError.message}, using original price`);
            }
          }
          
          updateData.price = newPrice >= 0 ? newPrice : 0;

          // Stock Quantity: REPLACE with new value from import (NOT add to existing)
          const newStock = medicineData.stockQuantity !== undefined && medicineData.stockQuantity !== null
            ? (typeof medicineData.stockQuantity === 'number' ? medicineData.stockQuantity : parseInt(medicineData.stockQuantity) || 0)
            : 0;
          updateData.stockQuantity = newStock >= 0 ? newStock : 0;

          // Low Stock Threshold: REPLACE with new value (default to 10 if not provided)
          const newThreshold = medicineData.lowStockThreshold !== undefined && medicineData.lowStockThreshold !== null
            ? (typeof medicineData.lowStockThreshold === 'number' ? medicineData.lowStockThreshold : parseInt(medicineData.lowStockThreshold) || 10)
            : 10;
          updateData.lowStockThreshold = newThreshold >= 0 ? newThreshold : 10;

          // Expiry Date: REPLACE with new value (null if not provided)
          updateData.expiryDate = medicineData.expiryDate || null;

          console.log('Update data to be saved:', JSON.stringify(updateData, null, 2));

          savedMedicine = await prisma.medicineCatalog.update({
            where: { id: existingMedicine.id },
            data: updateData
          });

          // Verify the update was successful
          if (!savedMedicine || !savedMedicine.id) {
            throw new Error(`Failed to update medicine ${medicineData.name} - update returned no data`);
          }

          // Double-check that isActive was set correctly
          if (savedMedicine.isActive === false) {
            console.warn(`Medicine ${savedMedicine.name} (ID: ${savedMedicine.id}) was updated but is still inactive. Forcing reactivation...`);
            savedMedicine = await prisma.medicineCatalog.update({
              where: { id: savedMedicine.id },
              data: { isActive: true }
            });
          }

          console.log('Medicine updated successfully:', savedMedicine.id, 'Name:', savedMedicine.name, 'New stock:', savedMedicine.stockQuantity, 'Active:', savedMedicine.isActive, 'Hospital:', savedMedicine.hospitalId);
          importedMedicineIds.add(savedMedicine.id);
          savedMedicines.push(savedMedicine);
        } else {
          // Create new medicine
          const code = `MED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Convert price to base currency if import file has different currency
          let priceToSave = medicineData.price || 0;
          const importCurrency = medicineData.currency || 
            (medicineData.priceColumnHeader?.match(/\(([A-Z]{3})\)/i)?.[1]?.toUpperCase()) ||
            'USD'; // Default to USD if not detected
          
          // Convert to base currency if different
          if (priceToSave > 0 && baseCurrency && importCurrency !== baseCurrency) {
            try {
              console.log(`Converting price ${priceToSave} from ${importCurrency} to ${baseCurrency} for new medicine`);
              const convertedPrice = await convertCurrency(priceToSave, importCurrency, baseCurrency);
              if (convertedPrice !== null && convertedPrice > 0) {
                priceToSave = convertedPrice;
                console.log(`Converted price: ${priceToSave} ${baseCurrency}`);
              } else {
                console.warn(`Currency conversion failed for ${priceToSave} ${importCurrency} to ${baseCurrency}, using original price`);
              }
            } catch (conversionError: any) {
              console.warn(`Error converting currency: ${conversionError.message}, using original price`);
            }
          }
          
          const createData = {
            code: code,
            name: medicineData.name.trim(),
            genericName: medicineData.genericName,
            manufacturer: medicineData.manufacturer,
            category: medicineData.category || 'General',
            therapeuticClass: medicineData.therapeuticClass,
            atcCode: medicineData.atcCode,
            price: priceToSave,
            stockQuantity: medicineData.stockQuantity || 0,
            lowStockThreshold: medicineData.lowStockThreshold || 10,
            expiryDate: medicineData.expiryDate,
            isActive: true,
            hospitalId: hospitalId // Always include hospitalId
          };

          savedMedicine = await prisma.medicineCatalog.create({
            data: createData
          });

          // Verify the create was successful
          if (!savedMedicine || !savedMedicine.id) {
            throw new Error(`Failed to create medicine ${medicineData.name} - create returned no data`);
          }

          console.log('Medicine created successfully:', savedMedicine.id, 'Name:', savedMedicine.name, 'Hospital:', savedMedicine.hospitalId);
          importedMedicineIds.add(savedMedicine.id);
          savedMedicines.push(savedMedicine);
        }

        // Create low stock alert if needed
        if (savedMedicine.stockQuantity <= savedMedicine.lowStockThreshold) {
          // Check if alert already exists
          const existingAlert = await prisma.lowStockAlert.findFirst({
            where: {
              medicineId: savedMedicine.id
            }
          });

          if (!existingAlert) {
            await prisma.lowStockAlert.create({
              data: {
                medicineId: savedMedicine.id,
                threshold: savedMedicine.lowStockThreshold,
                currentStock: savedMedicine.stockQuantity
              }
            });
          }
        }
      } catch (error: any) {
        errors.push(`Row ${i + 2} - "${medicineData.name || 'Unknown'}": ${error.message || 'Unknown error'}`);
      }
    }

    // Second pass: Delete medicines that are NOT in the import file (full replace mode)
    // Only delete medicines that belong to this hospital
    let deletedCount = 0;
    try {
      const allHospitalMedicines = await prisma.medicineCatalog.findMany({
        where: {
          hospitalId: hospitalId,
          isActive: true
        },
        select: {
          id: true,
          name: true
        }
      });

      // Find medicines in database that are NOT in the import file
      // Check both by name (case-insensitive) and by ID (in case name changed)
      const medicinesToDelete = allHospitalMedicines.filter(medicine => {
        const medicineNameLower = medicine.name.trim().toLowerCase();
        const notInImportByName = !importedMedicineNames.has(medicineNameLower);
        const notInImportById = !importedMedicineIds.has(medicine.id);
        // Delete if not found by name AND not found by ID (in case it was updated)
        return notInImportByName && notInImportById;
      });

      // Delete medicines not in import file
      if (medicinesToDelete.length > 0) {
        console.log(`Deleting ${medicinesToDelete.length} medicines not present in import file...`);
        for (const medicineToDelete of medicinesToDelete) {
          try {
            await prisma.medicineCatalog.update({
              where: { id: medicineToDelete.id },
              data: { isActive: false } // Soft delete by setting isActive to false
            });
            deletedCount++;
            console.log(`Deleted medicine: ${medicineToDelete.name} (ID: ${medicineToDelete.id})`);
          } catch (deleteError: any) {
            console.error(`Failed to delete medicine ${medicineToDelete.name}:`, deleteError);
            errors.push(`Failed to delete medicine "${medicineToDelete.name}": ${deleteError.message}`);
          }
        }
      }
    } catch (deleteError: any) {
      console.error('Error during cleanup of medicines not in import file:', deleteError);
      errors.push(`Warning: Could not delete medicines not in import file: ${deleteError.message}`);
    }

    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup uploaded file:', cleanupError);
      }
    }

    // Verify saved medicines exist in database (with retry for eventual consistency)
    let verifiedCount = 0;
    try {
      const savedIds = savedMedicines.map(m => m.id);
      if (savedIds.length > 0) {
        // First try: Check without isActive filter (in case of any timing issues)
        let verifiedMedicines = await prisma.medicineCatalog.findMany({
          where: {
            id: { in: savedIds },
            hospitalId: hospitalId
          },
          select: { id: true, name: true, stockQuantity: true, isActive: true }
        });
        
        verifiedCount = verifiedMedicines.length;
        
        // If not all found, wait a bit and retry (for eventual consistency)
        if (verifiedCount < savedMedicines.length) {
          console.log(`First verification found ${verifiedCount} of ${savedMedicines.length}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
          
          verifiedMedicines = await prisma.medicineCatalog.findMany({
            where: {
              id: { in: savedIds },
              hospitalId: hospitalId
            },
            select: { id: true, name: true, stockQuantity: true, isActive: true }
          });
          verifiedCount = verifiedMedicines.length;
        }
        
        // Check how many are active
        const activeCount = verifiedMedicines.filter(m => m.isActive === true).length;
        const inactiveMedicines = verifiedMedicines.filter(m => m.isActive === false);
        
        console.log(`Verified ${verifiedCount} of ${savedMedicines.length} imported medicines exist in database (${activeCount} active, ${inactiveMedicines.length} inactive)`);
        
        // Reactivate any inactive medicines (they should all be active after import)
        if (inactiveMedicines.length > 0) {
          console.log(`Reactivating ${inactiveMedicines.length} medicines that were marked as inactive...`);
          const inactiveIds = inactiveMedicines.map(m => m.id);
          try {
            const reactivateResult = await prisma.medicineCatalog.updateMany({
              where: {
                id: { in: inactiveIds },
                hospitalId: hospitalId
              },
              data: {
                isActive: true
              }
            });
            console.log(`Successfully reactivated ${reactivateResult.count} medicines`);
            
            // Re-verify after reactivation to get accurate count
            const reVerified = await prisma.medicineCatalog.findMany({
              where: {
                id: { in: savedIds },
                hospitalId: hospitalId,
                isActive: true
              },
              select: { id: true, name: true }
            });
            verifiedCount = reVerified.length;
            console.log(`After reactivation: ${verifiedCount} of ${savedMedicines.length} medicines are now active`);
          } catch (reactivateError: any) {
            console.error('Error reactivating medicines:', reactivateError);
            errors.push(`Warning: Could not reactivate ${inactiveMedicines.length} medicines: ${reactivateError.message}`);
          }
        }
        
        // Only warn if medicines are completely missing (not found at all)
        if (verifiedCount < savedMedicines.length) {
          const allFoundMedicines = await prisma.medicineCatalog.findMany({
            where: {
              id: { in: savedIds },
              hospitalId: hospitalId
            },
            select: { id: true }
          });
          const missingIds = savedIds.filter(id => !allFoundMedicines.some(m => m.id === id));
          if (missingIds.length > 0) {
            console.warn(`Warning: ${missingIds.length} medicines were not found in database after import. Missing IDs: ${missingIds.join(', ')}`);
            errors.push(`Warning: ${missingIds.length} medicines could not be found in database after import`);
          }
        }
      }
    } catch (verifyError: any) {
      console.error('Error verifying imported medicines:', verifyError);
      // Don't add to errors - verification is just a check, not critical
      console.warn('Verification failed, but medicines were saved. This may be a timing issue.');
    }

    // Log the action
    try {
      await logAudit({
        userId: req.user!.id,
        action: 'IMPORT_MEDICINE_CATALOG',
        tableName: 'medicine_catalog',
        recordId: 'bulk_import',
        newValue: { 
          importedCount: savedMedicines.length, 
          verifiedCount: verifiedCount,
          deletedCount: deletedCount,
          errors: errors.length 
        }
      });
    } catch (auditError) {
      console.warn('Failed to create audit log:', auditError);
    }

    console.log(`Import completed: ${savedMedicines.length} imported, ${deletedCount} deleted, ${errors.length} errors, ${verifiedCount} verified`);

    // Separate actual errors from warnings
    const actualErrors = errors.filter(e => !e.toLowerCase().includes('warning'));
    const warnings = errors.filter(e => e.toLowerCase().includes('warning'));

    res.json({
      success: true,
      message: `Successfully imported ${savedMedicines.length} medicine(s). ${deletedCount > 0 ? `${deletedCount} medicine(s) not in file were removed. ` : ''}${actualErrors.length > 0 ? `${actualErrors.length} error(s) occurred.` : ''}`,
      data: {
        imported: savedMedicines,
        importedCount: savedMedicines.length,
        verifiedCount: verifiedCount,
        deletedCount: deletedCount,
        errors: actualErrors,
        warnings: warnings,
        errorCount: actualErrors.length,
        warningCount: warnings.length
      }
    });
  } catch (error: any) {
    console.error('Import medicine catalog error:', error);

    // Clean up uploaded file on error
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup uploaded file on error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: `Error importing medicine catalog: ${error.message || 'Unknown error occurred'}`
    });
  }
};

// Create medicine order
export const createMedicineOrder = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = orderCreateSchema.parse(req.body);
    const { supplierId, orderItems, expectedDelivery, notes } = validatedData;

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const order = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, isActive: true } });
      if (!supplier) throw new Error('SUPPLIER_NOT_FOUND');

      let totalAmount = 0;
      const processedItems: Array<{
        medicineId: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }> = [];

      for (const item of orderItems) {
        let medicineId = item.medicineId;

        if (item.source === 'new' && item.newMedicine) {
          const duplicate = await tx.medicineCatalog.findFirst({
            where: { name: { equals: item.newMedicine.name, mode: 'insensitive' }, isActive: true },
          });
          if (duplicate) throw new Error(`MEDICINE_EXISTS:${item.newMedicine.name}`);

          const medicine = await tx.medicineCatalog.create({
            data: {
              code: item.newMedicine.code || `MED-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: item.newMedicine.name,
              genericName: item.newMedicine.genericName,
              manufacturer: item.newMedicine.manufacturer,
              category: item.newMedicine.category,
              price: item.unitPrice,
              stockQuantity: 0,
              lowStockThreshold: item.newMedicine.lowStockThreshold,
              isActive: true,
            },
          });
          medicineId = medicine.id;
        } else {
          const medicine = await tx.medicineCatalog.findFirst({
            where: { id: medicineId, isActive: true },
          });
          if (!medicine) throw new Error(`MEDICINE_NOT_FOUND:${medicineId}`);
        }

        const totalPrice = item.quantity * item.unitPrice;
        totalAmount += totalPrice;
        processedItems.push({
          medicineId: medicineId!,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice,
        });
      }

      return tx.medicineOrder.create({
        data: {
          orderNumber,
          supplierId,
          orderDate: new Date(),
          expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
          totalAmount,
          notes,
          createdBy: req.user!.id,
          orderItems: { create: processedItems },
        },
        include: {
          supplier: true,
          orderItems: {
            include: { medicine: true },
          }
        },
      });
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_MEDICINE_ORDER',
      tableName: 'medicine_orders',
      recordId: order.id,
      newValue: order,
    });

    res.status(201).json({
      success: true,
      message: 'Medicine order created successfully',
      data: { order }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    if (error.message === 'SUPPLIER_NOT_FOUND') {
      return res.status(400).json({ success: false, message: 'Selected supplier was not found or is inactive' });
    }
    if (error.message?.startsWith('MEDICINE_EXISTS:')) {
      return res.status(400).json({
        success: false,
        message: `"${error.message.slice('MEDICINE_EXISTS:'.length)}" already exists. Select it from inventory instead.`,
      });
    }
    if (error.message?.startsWith('MEDICINE_NOT_FOUND:')) {
      return res.status(400).json({ success: false, message: 'One of the selected medicines was not found' });
    }

    console.error('Create medicine order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating medicine order'
    });
  }
};

// Get medicine orders
export const getMedicineOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, supplierId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const orders = await prisma.medicineOrder.findMany({
      where,
      include: {
        supplier: true,
        orderItems: {
          include: {
            medicine: true
          }
        },
        createdByUser: {
          select: { id: true, fullName: true }
        }
      },
      orderBy: { orderDate: 'desc' },
      skip,
      take: Number(limit)
    });

    const total = await prisma.medicineOrder.count({ where });

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalItems: total,
          itemsPerPage: Number(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get medicine orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching medicine orders'
    });
  }
};

// Update order status
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = orderStatusUpdateSchema.parse(req.body);
    const { status, actualDelivery, invoiceNumber, invoiceFile } = validatedData;

    const order = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.medicineOrder.findUnique({
        where: { id },
        include: { orderItems: true },
      });
      if (!existingOrder) throw new Error('ORDER_NOT_FOUND');
      if (existingOrder.status === 'DELIVERED') throw new Error('ORDER_ALREADY_DELIVERED');
      if (existingOrder.status === 'CANCELLED') throw new Error('ORDER_CANCELLED');

      if (status === 'DELIVERED') {
        // Claim the transition before changing stock. The status condition makes
        // repeated or concurrent delivery requests safe.
        const claimed = await tx.medicineOrder.updateMany({
          where: {
            id,
            status: { notIn: ['DELIVERED', 'CANCELLED'] },
          },
          data: {
            status: 'DELIVERED',
            actualDelivery: actualDelivery ? new Date(actualDelivery) : new Date(),
          },
        });
        if (claimed.count !== 1) throw new Error('ORDER_ALREADY_DELIVERED');

        for (const item of existingOrder.orderItems) {
          await tx.medicineCatalog.update({
            where: { id: item.medicineId },
            data: { stockQuantity: { increment: item.quantity } },
          });
          await tx.medicineOrderItem.update({
            where: { id: item.id },
            data: { receivedQty: item.quantity },
          });
        }
      }

      return tx.medicineOrder.update({
        where: { id },
        data: {
          status,
          actualDelivery: status === 'DELIVERED'
            ? (actualDelivery ? new Date(actualDelivery) : new Date())
            : (actualDelivery ? new Date(actualDelivery) : undefined),
          invoiceNumber,
          invoiceFile,
        },
        include: {
          supplier: true,
          orderItems: { include: { medicine: true } },
        },
      });
    });

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    if (error.message === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Medicine order not found' });
    }
    if (error.message === 'ORDER_ALREADY_DELIVERED') {
      return res.status(409).json({ success: false, message: 'This order is already delivered; stock was not changed again' });
    }
    if (error.message === 'ORDER_CANCELLED') {
      return res.status(409).json({ success: false, message: 'A cancelled order cannot be changed or delivered' });
    }

    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status'
    });
  }
};

// Upload invoice file
export const uploadInvoiceFile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { orderId } = req.params;
    const filePath = req.file.path;

    const order = await prisma.medicineOrder.update({
      where: { id: orderId },
      data: {
        invoiceFile: filePath
      }
    });

    res.json({
      success: true,
      message: 'Invoice file uploaded successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Upload invoice file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading invoice file'
    });
  }
};

// Get suppliers
export const getSuppliers = async (req: AuthRequest, res: Response) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    res.json({
      success: true,
      data: { suppliers }
    });
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suppliers'
    });
  }
};

// Create supplier
export const createSupplier = async (req: AuthRequest, res: Response) => {
  try {
    const { name, address, contact, email, gstNumber } = supplierCreateSchema.parse(req.body);

    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { gstNumber: { equals: gstNumber, mode: 'insensitive' } },
          { name: { equals: name, mode: 'insensitive' } },
        ],
        isActive: true,
      },
    });
    if (existingSupplier) {
      return res.status(409).json({
        success: false,
        message: existingSupplier.gstNumber?.toUpperCase() === gstNumber
          ? 'A supplier with this GST number already exists'
          : 'A supplier with this name already exists',
      });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        address: address || null,
        contact: contact || null,
        email: email || null,
        gstNumber
      }
    });

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: { supplier }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues[0]?.message || 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Create supplier error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating supplier'
    });
  }
};

// Get medicine order by ID (for invoice generation)
export const getMedicineOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const order = await prisma.medicineOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        orderItems: {
          include: {
            medicine: {
              select: {
                name: true,
                manufacturer: true
              }
            }
          }
        },
        createdByUser: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Medicine order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get medicine order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching medicine order'
    });
  }
};
