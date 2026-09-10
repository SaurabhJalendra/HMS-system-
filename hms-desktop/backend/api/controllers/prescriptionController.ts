import { Response } from 'express';
import { PrismaClient, PrescriptionStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { computeUnitsToDispenseForLine } from '../utils/prescriptionDispenseUnits';

const prisma = new PrismaClient();

// Validation schemas
const prescriptionItemSchema = z.object({
  medicineId: z.string().min(1, 'Medicine ID is required'),
  quantity: z.number().int().positive('Quantity must be positive'),
  frequency: z.string().min(1, 'Frequency is required'),
  duration: z.number().int().positive('Duration must be positive'),
  instructions: z.string().optional(),
  dosage: z.string().optional(),
  withFood: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const prescriptionCreateSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  appointmentId: z.string().optional().transform((val) => (!val || val.trim() === '') ? undefined : val),
  consultationId: z.string().optional().transform((val) => (!val || val.trim() === '') ? undefined : val),
  notes: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, 'At least one medicine item is required'),
});

const prescriptionTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(100),
  description: z.string().trim().max(500).optional(),
  templateData: z.array(prescriptionItemSchema.omit({ startDate: true, endDate: true }))
    .min(1, 'A template needs at least one medicine'),
});

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

// Generate unique prescription number
const generatePrescriptionNumber = async (): Promise<string> => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const prefix = `RX${year}${month}${day}`;
  
  // Get count of prescriptions for today
  const startOfDay = new Date(year, today.getMonth(), today.getDate());
  const endOfDay = new Date(year, today.getMonth(), today.getDate() + 1);
  
  const count = await prisma.prescription.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
  });
  
  const sequence = String(count + 1).padStart(4, '0');
  return `${prefix}${sequence}`;
};

// Create prescription - Simplified version
export const createPrescription = async (req: AuthRequest, res: Response) => {
  try {
    console.log('Creating prescription with data:', req.body);
    
    const userId = req.user?.id;
    if (!userId) {
      console.log('No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    console.log('User ID:', userId);
    const validatedData = prescriptionCreateSchema.parse(req.body);
    console.log('Validated data:', validatedData);
    
    // Convert empty strings/undefined to null for optional foreign keys
    // Prisma accepts null for optional fields
    const appointmentId = (validatedData.appointmentId && typeof validatedData.appointmentId === 'string' && validatedData.appointmentId.trim() !== '') 
      ? validatedData.appointmentId 
      : null;
    const consultationId = (validatedData.consultationId && typeof validatedData.consultationId === 'string' && validatedData.consultationId.trim() !== '') 
      ? validatedData.consultationId 
      : null;

    console.log('Processed appointmentId:', appointmentId, typeof appointmentId);
    console.log('Processed consultationId:', consultationId, typeof consultationId);

    // Verify patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: validatedData.patientId },
      select: { id: true },
    });

    if (!patient) {
      console.error('Patient not found:', validatedData.patientId);
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Verify doctor exists
    const doctor = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!doctor) {
      console.error('Doctor not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'Doctor not found',
      });
    }

    // If appointmentId is provided, verify it exists
    if (appointmentId) {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { id: true },
      });
      if (!appointment) {
        console.error('Appointment not found:', appointmentId);
        return res.status(404).json({
          success: false,
          message: 'Appointment not found',
        });
      }
    }

    // If consultationId is provided, verify it exists
    if (consultationId) {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationId },
        select: { id: true },
      });
      if (!consultation) {
        console.error('Consultation not found:', consultationId);
        return res.status(404).json({
          success: false,
          message: 'Consultation not found',
        });
      }
    }

    // Verify all medicines exist and calculate the amount for all physical
    // units that will be handed to the patient at dispense time.
    let totalAmount = 0;
    for (const item of validatedData.items) {
      const medicine = await prisma.medicineCatalog.findUnique({
        where: { id: item.medicineId },
        select: { id: true, price: true },
      });
      if (!medicine) {
        console.error('Medicine not found:', item.medicineId);
        return res.status(404).json({
          success: false,
          message: `Medicine not found: ${item.medicineId}`,
        });
      }
      totalAmount += Number(medicine.price) * computeUnitsToDispenseForLine(item);
    }
    totalAmount = roundMoney(totalAmount);
    console.log('Calculated total amount:', totalAmount);

    // Generate prescription number
    const prescriptionNumber = await generatePrescriptionNumber();
    console.log('Generated prescription number:', prescriptionNumber);

    // Prepare data object for Prisma
    // For optional fields, Prisma accepts null or undefined
    const prescriptionData: any = {
      patientId: validatedData.patientId,
      doctorId: userId,
      prescriptionNumber,
      notes: validatedData.notes || null,
      totalAmount,
      prescriptionItems: {
        create: validatedData.items.map((item, index) => ({
          medicineId: item.medicineId,
          quantity: item.quantity,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions || null,
          dosage: item.dosage || null,
          withFood: item.withFood || null,
          startDate: item.startDate ? new Date(item.startDate) : null,
          endDate: item.endDate ? new Date(item.endDate) : null,
          rowOrder: index,
        })),
      },
    };

    // Only add optional foreign keys if they have values
    if (appointmentId) {
      prescriptionData.appointmentId = appointmentId;
    }
    if (consultationId) {
      prescriptionData.consultationId = consultationId;
    }

    console.log('Creating prescription with data:', JSON.stringify(prescriptionData, null, 2));

    // Validate data structure before creating
    if (!prescriptionData.patientId || !prescriptionData.doctorId || !prescriptionData.prescriptionNumber) {
      console.error('Missing required fields in prescription data');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: patientId, doctorId, or prescriptionNumber',
      });
    }

    if (!prescriptionData.prescriptionItems || !prescriptionData.prescriptionItems.create || prescriptionData.prescriptionItems.create.length === 0) {
      console.error('No prescription items provided');
      return res.status(400).json({
        success: false,
        message: 'At least one prescription item is required',
      });
    }

    // Create prescription
    const prescription = await prisma.prescription.create({
      data: prescriptionData,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            age: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        prescriptionItems: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                genericName: true,
                manufacturer: true,
                price: true,
                category: true,
              },
            },
          },
          orderBy: { rowOrder: 'asc' },
        },
      },
    });

    console.log('Prescription created successfully:', prescription.id);
    
    // Create audit log for prescription creation
    try {
      await prisma.prescriptionAudit.create({
        data: {
          prescriptionId: prescription.id,
          action: 'CREATED',
          performedBy: userId,
          changes: {
            prescriptionNumber: prescription.prescriptionNumber,
            patientId: prescription.patientId,
            doctorId: prescription.doctorId,
            totalAmount: prescription.totalAmount,
            itemCount: prescription.prescriptionItems.length,
          },
          notes: `Prescription ${prescription.prescriptionNumber} created`,
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
      // Don't fail the operation if audit log creation fails
    }
    
    res.status(201).json({
      success: true,
      data: {
        prescription,
        warnings: {
          interactions: [],
          allergies: [],
        },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    // Enhanced error logging
    console.error('========== CREATE PRESCRIPTION ERROR ==========');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error meta:', error?.meta);
    if (error?.stack) {
      console.error('Error stack:', error.stack);
    }
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    console.error('===============================================');
    
    // Return more detailed error information
    const errorMessage = error?.message || 'Internal server error';
    const errorCode = error?.code || 'UNKNOWN_ERROR';
    
    // Check for Prisma errors
    if (error?.code === 'P2003') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reference to related record. Please check patient, doctor, appointment, or consultation IDs.',
        error: errorMessage,
        code: errorCode,
      });
    }
    
    if (error?.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'A prescription with this number already exists',
        error: errorMessage,
        code: errorCode,
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: errorMessage,
      code: errorCode,
      ...(process.env.NODE_ENV === 'development' && { 
        details: error?.meta,
        stack: error?.stack 
      }),
    });
  }
};

// Get all prescriptions with search and pagination
export const getPrescriptions = async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, patientId, doctorId, page = 1, limit = 20 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    // Build where clause
    const where: any = {};
    
    if (patientId) {
      where.patientId = patientId;
    }
    
    if (doctorId) {
      where.doctorId = doctorId;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { prescriptionNumber: { contains: search, mode: 'insensitive' } },
        { patient: { name: { contains: search, mode: 'insensitive' } } },
        { doctor: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Get prescriptions with pagination
    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              age: true,
              dateOfBirth: true,
              gender: true,
              phone: true,
            },
          },
          doctor: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          prescriptionItems: {
            include: {
              medicine: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                },
              },
            },
            orderBy: { rowOrder: 'asc' },
          },
        },
      }),
      prisma.prescription.count({ where }),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    res.json({
      success: true,
      data: {
        prescriptions,
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
    console.error('Get prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const getPrescriptionById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            age: true,
            dateOfBirth: true,
            gender: true,
            phone: true,
            address: true,
            bloodGroup: true,
          },
        },
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true,
            username: true,
            qualifications: true,
            registrationNumber: true,
            phone: true,
            email: true,
          },
        },
        consultation: {
          select: {
            id: true,
            diagnosis: true,
            notes: true,
            consultationDate: true,
            temperature: true,
            bloodPressure: true,
            followUpDate: true,
          },
        },
        prescriptionItems: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                genericName: true,
                manufacturer: true,
                price: true,
                category: true,
              },
            },
          },
          orderBy: { rowOrder: 'asc' },
        },
      },
    });

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found',
      });
    }

    res.json({
      success: true,
      data: { prescription },
    });
  } catch (error) {
    console.error('Get prescription by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const updatePrescription = async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: { prescription: {} } });
};

export const dispensePrescription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const existingPrescription = await prisma.prescription.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        prescriptionNumber: true,
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

    if (!existingPrescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found',
      });
    }

    if (existingPrescription.status === PrescriptionStatus.DISPENSED) {
      return res.status(400).json({
        success: false,
        message: 'Prescription has already been dispensed',
      });
    }

    if (existingPrescription.status === PrescriptionStatus.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot dispense a cancelled prescription',
      });
    }

    const items = existingPrescription.prescriptionItems;
    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: 'Prescription has no line items to dispense',
      });
    }

    const lineDispense: { medicineId: string; units: number }[] = [];
    const requiredByMedicine = new Map<string, number>();

    for (const row of items) {
      const units = computeUnitsToDispenseForLine(row);
      lineDispense.push({ medicineId: row.medicineId, units });
      requiredByMedicine.set(row.medicineId, (requiredByMedicine.get(row.medicineId) || 0) + units);
    }

    const medicineIds = [...requiredByMedicine.keys()];
    const catalogRows = await prisma.medicineCatalog.findMany({
      where: { id: { in: medicineIds } },
      select: { id: true, name: true, stockQuantity: true, price: true },
    });

    if (catalogRows.length !== medicineIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more medicines on this prescription are missing from the catalog',
      });
    }

    const shortages: string[] = [];
    for (const m of catalogRows) {
      const need = requiredByMedicine.get(m.id) || 0;
      if (m.stockQuantity < need) {
        shortages.push(`${m.name}: need ${need} units, in stock ${m.stockQuantity}`);
      }
    }
    if (shortages.length) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock to dispense this prescription',
        details: shortages,
      });
    }

    const catalogById = new Map(catalogRows.map((medicine) => [medicine.id, medicine]));
    const dispensedTotal = roundMoney(
      lineDispense.reduce(
        (total, line) =>
          total + Number(catalogById.get(line.medicineId)?.price ?? 0) * line.units,
        0,
      ),
    );

    const prescription = await prisma.$transaction(async (tx) => {
      for (const [medicineId, need] of requiredByMedicine) {
        const updated = await tx.medicineCatalog.updateMany({
          where: { id: medicineId, stockQuantity: { gte: need } },
          data: { stockQuantity: { decrement: need } },
        });
        if (updated.count !== 1) {
          throw new Error('CONCURRENT_STOCK_MISMATCH');
        }
      }

      for (const line of lineDispense) {
        await tx.medicineTransaction.create({
          data: {
            prescriptionId: id,
            medicineId: line.medicineId,
            quantityDispensed: line.units,
            dispensedBy: userId,
          },
        });
      }

      return tx.prescription.update({
        where: { id },
        data: {
          status: PrescriptionStatus.DISPENSED,
          isDispensed: true,
          dispensedAt: new Date(),
          dispensedBy: userId,
          totalAmount: dispensedTotal,
          notes: notes || existingPrescription.prescriptionNumber + ' dispensed',
        },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              age: true,
              dateOfBirth: true,
              gender: true,
            },
          },
          doctor: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          prescriptionItems: {
            include: {
              medicine: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                },
              },
            },
            orderBy: { rowOrder: 'asc' },
          },
        },
      });
    });

    // Create audit log
    try {
      await prisma.prescriptionAudit.create({
        data: {
          prescriptionId: id,
          action: 'DISPENSED',
          performedBy: userId,
          changes: {
            status: { from: existingPrescription.status, to: PrescriptionStatus.DISPENSED },
            dispensedAt: new Date().toISOString(),
          },
          notes: notes || 'Prescription dispensed',
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
      // Don't fail the operation if audit log creation fails
    }

    console.log('Prescription dispensed successfully:', id);
    
    res.json({
      success: true,
      message: 'Prescription dispensed successfully',
      data: { prescription },
    });
  } catch (error: any) {
    console.error('Dispense prescription error:', error);
    if (error?.message === 'CONCURRENT_STOCK_MISMATCH') {
      return res.status(409).json({
        success: false,
        message: 'Stock changed while dispensing. Refresh medicine stock and try again.',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to dispense prescription',
      error: error?.message || 'Internal server error',
    });
  }
};

export const cancelPrescription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required',
      });
    }

    // Check if prescription exists
    const existingPrescription = await prisma.prescription.findUnique({
      where: { id },
      select: { id: true, status: true, prescriptionNumber: true },
    });

    if (!existingPrescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found',
      });
    }

    // Check if already cancelled
    if (existingPrescription.status === PrescriptionStatus.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: 'Prescription has already been cancelled',
      });
    }

    // Check if already dispensed
    if (existingPrescription.status === PrescriptionStatus.DISPENSED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a dispensed prescription',
      });
    }

    // Update prescription status to CANCELLED
    const prescription = await prisma.prescription.update({
      where: { id },
      data: {
        status: PrescriptionStatus.CANCELLED,
        isDispensed: false,
        notes: `${existingPrescription.prescriptionNumber} cancelled - Reason: ${reason}`,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            age: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        prescriptionItems: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
          orderBy: { rowOrder: 'asc' },
        },
      },
    });

    // Create audit log
    try {
      await prisma.prescriptionAudit.create({
        data: {
          prescriptionId: id,
          action: 'CANCELLED',
          performedBy: userId,
          changes: {
            status: { from: existingPrescription.status, to: PrescriptionStatus.CANCELLED },
            cancelledAt: new Date().toISOString(),
          },
          notes: `Cancelled - Reason: ${reason}`,
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
      // Don't fail the operation if audit log creation fails
    }

    console.log('Prescription cancelled successfully:', id);
    
    res.json({
      success: true,
      message: 'Prescription cancelled successfully',
      data: { prescription },
    });
  } catch (error: any) {
    console.error('Cancel prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel prescription',
      error: error?.message || 'Internal server error',
    });
  }
};

export const deletePrescription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Check if prescription exists
    const existingPrescription = await prisma.prescription.findUnique({
      where: { id },
      select: { id: true, status: true, prescriptionNumber: true },
    });

    if (!existingPrescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found',
      });
    }

    // Delete the prescription (cascade will delete related items and audit logs)
    await prisma.prescription.delete({
      where: { id },
    });

    console.log('Prescription deleted successfully:', id);
    
    res.json({
      success: true,
      message: 'Prescription deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete prescription',
      error: error?.message || 'Internal server error',
    });
  }
};

export const getPrescriptionInventoryAudit = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const prescription = await prisma.prescription.findUnique({
      where: { id },
      select: {
        id: true,
        prescriptionNumber: true,
        status: true,
        patient: { select: { id: true, name: true } },
        prescriptionItems: {
          orderBy: { rowOrder: 'asc' },
          select: {
            id: true,
            quantity: true,
            frequency: true,
            duration: true,
            dosage: true,
            medicine: {
              select: {
                id: true,
                code: true,
                name: true,
                stockQuantity: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    const items = prescription.prescriptionItems.map((item) => {
      const requiredUnits = computeUnitsToDispenseForLine(item);
      const availableUnits = item.medicine.stockQuantity;
      return {
        prescriptionItemId: item.id,
        medicineId: item.medicine.id,
        medicineCode: item.medicine.code,
        medicineName: item.medicine.name,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        quantityPerDose: item.quantity,
        requiredUnits,
        availableUnits,
        shortageUnits: Math.max(0, requiredUnits - availableUnits),
        isAvailable: item.medicine.isActive && availableUnits >= requiredUnits,
        isActive: item.medicine.isActive,
      };
    });

    return res.json({
      success: true,
      data: {
        audit: {
          prescriptionId: prescription.id,
          prescriptionNumber: prescription.prescriptionNumber,
          prescriptionStatus: prescription.status,
          patient: prescription.patient,
          canDispense: items.length > 0 && items.every((item) => item.isAvailable),
          items,
          checkedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Prescription inventory audit error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check prescription inventory',
    });
  }
};

export const getPrescriptionTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.prescriptionTemplate.findMany({
      where: { createdBy: req.user!.id, isActive: true },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
    return res.json({ success: true, data: { templates } });
  } catch (error) {
    console.error('Get prescription templates error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load templates' });
  }
};

export const createPrescriptionTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const data = prescriptionTemplateSchema.parse(req.body);
    const medicineIds = [...new Set(data.templateData.map((item) => item.medicineId))];
    const medicineCount = await prisma.medicineCatalog.count({
      where: { id: { in: medicineIds }, isActive: true },
    });
    if (medicineCount !== medicineIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more template medicines are missing or inactive',
      });
    }

    const template = await prisma.prescriptionTemplate.create({
      data: {
        name: data.name,
        description: data.description || null,
        templateData: data.templateData,
        createdBy: req.user!.id,
      },
    });
    return res.status(201).json({ success: true, data: { template } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'You already have a template with this name',
      });
    }
    console.error('Create prescription template error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create template' });
  }
};

export const deletePrescriptionTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const updated = await prisma.prescriptionTemplate.updateMany({
      where: { id: req.params.id, createdBy: req.user!.id, isActive: true },
      data: { isActive: false },
    });
    if (updated.count !== 1) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    return res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Delete prescription template error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete template' });
  }
};

export const getPrescriptionStats = async (req: AuthRequest, res: Response) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalPrescriptions,
      pendingPrescriptions,
      dispensedPrescriptions,
      cancelledPrescriptions,
      dispensedToday,
      dispensedRevenue,
      recentPrescriptions,
    ] = await Promise.all([
      prisma.prescription.count(),
      prisma.prescription.count({
        where: { isDispensed: false, status: PrescriptionStatus.ACTIVE },
      }),
      prisma.prescription.count({ where: { status: PrescriptionStatus.DISPENSED } }),
      prisma.prescription.count({ where: { status: PrescriptionStatus.CANCELLED } }),
      prisma.prescription.count({
        where: {
          status: PrescriptionStatus.DISPENSED,
          dispensedAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
      prisma.prescription.aggregate({
        where: { status: PrescriptionStatus.DISPENSED },
        _sum: { totalAmount: true },
      }),
      prisma.prescription.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
    ]);

    const totalRevenue = Number(dispensedRevenue._sum.totalAmount ?? 0);

    res.json({
      success: true,
      data: {
        totalPrescriptions,
        pendingPrescriptions,
        /** Same as pendingPrescriptions — UI label "Active" */
        activePrescriptions: pendingPrescriptions,
        dispensedPrescriptions,
        cancelledPrescriptions,
        totalRevenue,
        recentPrescriptions,
        dispensedToday,
      },
    });
  } catch (error) {
    console.error('Get prescription stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load prescription stats' });
  }
};

export const getPendingPrescriptions = async (req: AuthRequest, res: Response) => {
  try {
    const prescriptions = await prisma.prescription.findMany({
      where: {
        isDispensed: false,
        status: PrescriptionStatus.ACTIVE,
      },
      take: 80,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: { id: true, name: true, phone: true, gender: true, age: true, dateOfBirth: true },
        },
        doctor: {
          select: { id: true, fullName: true, role: true },
        },
        prescriptionItems: {
          include: {
            medicine: { select: { id: true, name: true, code: true } },
          },
          orderBy: { rowOrder: 'asc' },
        },
      },
    });

    res.json({ success: true, data: { prescriptions } });
  } catch (error) {
    console.error('Get pending prescriptions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load pending prescriptions' });
  }
};
