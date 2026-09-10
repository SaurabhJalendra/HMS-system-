import { Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/auditLogger';
import { getHospitalId } from '../utils/hospitalHelper';

const prisma = new PrismaClient();

// Helper function to convert age to dateOfBirth (approximate - uses January 1st of birth year)
const ageToDateOfBirth = (age: number): Date => {
  const today = new Date();
  const birthYear = today.getFullYear() - age;
  // Use January 1st as approximate date of birth
  return new Date(birthYear, 0, 1);
};

// Validation schemas
const patientCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  dateOfBirth: z.union([
    z.string().refine((date) => {
    const dob = new Date(date);
    const today = new Date();
    return dob <= today && !isNaN(dob.getTime());
  }, 'Date of birth must be a valid date in the past').transform((date) => new Date(date)),
    z.date()
  ]).optional(),
  age: z.union([
    z.number().int().min(0).max(150),
    z.string().transform((val) => {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num < 0 || num > 150) {
        throw new Error('Age must be a number between 0 and 150');
      }
      return num;
    }).optional()
  ]).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { message: 'Invalid gender' }),
  phone: z
    .string()
    .transform((val) => val.replace(/\D/g, ''))
    .pipe(z.string().regex(/^[0-9]{10}$/, 'Phone number must be exactly 10 digits')),
  aadharCardNumber: z.string()
    .regex(/^[0-9]{12}$/, 'Aadhar card number must be exactly 12 digits')
    .optional()
    .or(z.literal('')), // Allow empty string (Indian patients)
  passportNumber: z.union([
    z.string().min(6, 'Passport number must be at least 6 characters').max(20, 'Passport number too long')
      .regex(/^[A-Za-z0-9\-]+$/, 'Passport number can only contain letters, numbers and hyphens'),
    z.literal('')
  ]).optional(), // Allow empty (foreign patients use this when provided)
  address: z.string().min(1, 'Address is required').max(500, 'Address too long'),
  bloodGroup: z.string().trim().max(20, 'Blood group is too long').optional().or(z.literal('')),
  allergies: z.string().optional(),
  chronicConditions: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  referredBy: z.string().max(200, 'Referrer name too long').optional().or(z.literal('')),
}).refine((data) => {
  // At least one of dateOfBirth or age must be provided
  const hasDateOfBirth = data.dateOfBirth !== undefined && data.dateOfBirth !== null;
  const hasAge = data.age !== undefined && data.age !== null;
  return hasDateOfBirth || hasAge;
}, {
  message: 'Age is required',
  path: ['age']
});

const patientUpdateSchema = patientCreateSchema.partial();

// Helper function to calculate age from date of birth
const calculateAge = (dateOfBirth: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }

  return age;
};

/**
 * Compute display patient number: normalized name + "_" + last 4 of national id.
 * Example: "alex carry" + "123456789012" (12-digit Aadhar) -> "alex_carry_9012"
 * Uses Aadhar (last 4 digits) if present, else Passport (last 4 characters).
 * Returns null if no national id is provided.
 */
function computePatientNumber(name: string, aadharCardNumber?: string | null, passportNumber?: string | null): string | null {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!normalizedName) return null;

  let last4: string | null = null;
  if (aadharCardNumber && /^[0-9]{12}$/.test(aadharCardNumber.trim())) {
    last4 = aadharCardNumber.trim().slice(-4);
  } else if (passportNumber && passportNumber.trim().length >= 4) {
    last4 = passportNumber.trim().slice(-4).replace(/[^a-zA-Z0-9]/g, '');
    if (last4.length < 4) last4 = passportNumber.trim().slice(-4);
  }
  if (!last4) return null;

  return `${normalizedName}_${last4}`;
}

/** Ensure patient id (name_last4 format) is unique; if taken, append _2, _3, ... */
async function ensureUniquePatientId(patientId: string, excludePatientId?: string): Promise<string> {
  let candidate = patientId;
  let suffix = 1;
  for (;;) {
    const existing = await prisma.patient.findUnique({ where: { id: candidate } });
    if (!existing || (excludePatientId && existing.id === excludePatientId)) return candidate;
    suffix++;
    candidate = `${patientId}_${suffix}`;
  }
}

const patientSearchSchema = z.object({
  search: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  bloodGroup: z.string().optional(),
  page: z.string().transform((val) => parseInt(val, 10) || 1).optional(),
  limit: z.string().transform((val) => {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n < 1) return 20;
    return Math.min(n, 100);
  }).optional(),
});

// Create new patient
export const createPatient = async (req: AuthRequest, res: Response) => {
  try {
    // Log incoming request for debugging
    console.log('[CreatePatient] Received request body:', JSON.stringify(req.body, null, 2));
    
    const validatedData = patientCreateSchema.parse(req.body);
    console.log('[CreatePatient] Validated data:', JSON.stringify(validatedData, null, 2));

    // Convert age to dateOfBirth if age is provided but dateOfBirth is not
    let dateOfBirth: Date;
    if (validatedData.dateOfBirth) {
      dateOfBirth = validatedData.dateOfBirth;
    } else if (validatedData.age !== undefined) {
      dateOfBirth = ageToDateOfBirth(validatedData.age);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either dateOfBirth or age must be provided',
      });
    }

    // Store the entered age as the source shown throughout the application.
    // dateOfBirth remains populated for compatibility with existing clinical records.
    const { age, ...patientData } = validatedData;
    const finalPatientData = {
      ...patientData,
      age: age ?? calculateAge(dateOfBirth),
      dateOfBirth,
      aadharCardNumber: patientData.aadharCardNumber?.trim() || undefined,
      passportNumber: patientData.passportNumber?.trim() || undefined,
      referredBy: patientData.referredBy?.trim() || undefined,
    };

    // Check for duplicate phone number
    const existingPatientByPhone = await prisma.patient.findUnique({
      where: { phone: finalPatientData.phone },
    });

    if (existingPatientByPhone) {
      return res.status(400).json({
        success: false,
        message: 'Patient with this phone number already exists',
        data: { existingPatientId: existingPatientByPhone.id }
      });
    }

    // Check for duplicate Aadhar card number if provided
    if (finalPatientData.aadharCardNumber) {
      const existingPatientByAadhar = await prisma.patient.findUnique({
        where: { aadharCardNumber: finalPatientData.aadharCardNumber },
      });

      if (existingPatientByAadhar) {
        return res.status(400).json({
          success: false,
          message: 'Patient with this Aadhar card number already exists',
          data: { existingPatientId: existingPatientByAadhar.id }
        });
      }
    }

    // Check for duplicate passport number if provided
    if (finalPatientData.passportNumber) {
      const existingPatientByPassport = await prisma.patient.findUnique({
        where: { passportNumber: finalPatientData.passportNumber },
      });

      if (existingPatientByPassport) {
        return res.status(400).json({
          success: false,
          message: 'Patient with this passport number already exists',
          data: { existingPatientId: existingPatientByPassport.id }
        });
      }
    }

    // Compute patient id: name_last4 (12-digit Aadhar or Passport); fallback if no national id
    const baseId = computePatientNumber(
      finalPatientData.name,
      finalPatientData.aadharCardNumber,
      finalPatientData.passportNumber
    );
    const patientId = baseId
      ? await ensureUniquePatientId(baseId)
      : await ensureUniquePatientId(
          `${(finalPatientData.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'patient')}_0000`
        );

    // Create patient with explicit id (human-readable, no CUID)
    const patient = await prisma.patient.create({
      data: {
        id: patientId,
        ...finalPatientData,
        phone: finalPatientData.phone as string,
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_PATIENT',
      tableName: 'patients',
      recordId: patient.id,
      newValue: patient,
    });

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      data: { patient },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2011' &&
      Array.isArray(error.meta?.constraint) &&
      error.meta.constraint.includes('old_id')
    ) {
      return res.status(500).json({
        success: false,
        message: 'Database migration required: patients.old_id must be nullable before creating new patients.',
      });
    }

    console.error('Create patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all patients with search and pagination
export const getPatients = async (req: AuthRequest, res: Response) => {
  try {
    const { search, gender, bloodGroup, page = 1, limit = 20 } = patientSearchSchema.parse(req.query);

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      const term = search.trim();
      const digitsOnly = term.replace(/\D/g, '');
      const or: any[] = [
        { name: { contains: term, mode: 'insensitive' } },
        { id: { contains: term, mode: 'insensitive' } },
        { patientNumber: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { aadharCardNumber: { contains: term } },
        { passportNumber: { contains: term, mode: 'insensitive' } },
        { address: { contains: term, mode: 'insensitive' } },
        { referredBy: { contains: term, mode: 'insensitive' } },
      ];
      // Match stored phones when user pasted "+91 …" or spaces but DB has plain digits
      if (digitsOnly.length >= 3 && digitsOnly !== term) {
        or.push({ phone: { contains: digitsOnly } });
      }
      where.OR = or;
    }

    if (gender) {
      where.gender = gender;
    }

    if (bloodGroup) {
      where.bloodGroup = bloodGroup;
    }

    // Get patients with pagination
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          patientNumber: true,
          age: true,
          dateOfBirth: true,
          gender: true,
          phone: true,
          aadharCardNumber: true,
          passportNumber: true,
          address: true,
          bloodGroup: true,
          allergies: true,
          chronicConditions: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          referredBy: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.patient.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        patients,
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
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get patient by ID
export const getPatientById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            doctor: {
              select: { fullName: true, role: true },
            },
          },
        },
        consultations: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            doctor: {
              select: { fullName: true, role: true },
            },
          },
        },
        prescriptions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            doctor: {
              select: { fullName: true, role: true },
            },
          },
        },
        labTests: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            testCatalog: {
              select: { testName: true, price: true },
            },
          },
        },
      },
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    res.json({
      success: true,
      data: {
        patient,
      },
    });
  } catch (error) {
    console.error('Get patient by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update patient
export const updatePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = patientUpdateSchema.parse(req.body);

    // Check if patient exists
    const existingPatient = await prisma.patient.findUnique({
      where: { id },
    });

    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Keep the compatibility dateOfBirth in sync when age is edited, while
    // preserving the exact age entered by the user in the patient row.
    let updateData: any = { ...validatedData };
    if (validatedData.age !== undefined && !validatedData.dateOfBirth) {
      updateData.dateOfBirth = ageToDateOfBirth(validatedData.age);
    } else if (validatedData.dateOfBirth && validatedData.age === undefined) {
      updateData.age = calculateAge(validatedData.dateOfBirth);
    }

    // Check for duplicate phone number if phone is being updated
    if (updateData.phone && updateData.phone !== existingPatient.phone) {
      const duplicatePatient = await prisma.patient.findUnique({
        where: { phone: updateData.phone },
      });

      if (duplicatePatient) {
        return res.status(400).json({
          success: false,
          message: 'Patient with this phone number already exists',
          data: { existingPatientId: duplicatePatient.id }
        });
      }
    }

    // Normalize empty ID strings to undefined for update
    if (updateData.aadharCardNumber !== undefined) updateData.aadharCardNumber = updateData.aadharCardNumber?.trim() || undefined;
    if (updateData.passportNumber !== undefined) updateData.passportNumber = updateData.passportNumber?.trim() || undefined;
    if (updateData.referredBy !== undefined) {
      updateData.referredBy = updateData.referredBy?.trim() ? updateData.referredBy.trim() : null;
    }

    // Note: patient id (name_last4) is set only on create; we do not change id on update.

    // Check for duplicate Aadhar card number if Aadhar is being updated
    if (updateData.aadharCardNumber && updateData.aadharCardNumber !== existingPatient.aadharCardNumber) {
      const duplicatePatientByAadhar = await prisma.patient.findUnique({
        where: { aadharCardNumber: updateData.aadharCardNumber },
      });

      if (duplicatePatientByAadhar) {
        return res.status(400).json({
          success: false,
          message: 'Patient with this Aadhar card number already exists',
          data: { existingPatientId: duplicatePatientByAadhar.id }
        });
      }
    }

    // Check for duplicate passport number if passport is being updated
    if (updateData.passportNumber && updateData.passportNumber !== existingPatient.passportNumber) {
      const duplicatePatientByPassport = await prisma.patient.findUnique({
        where: { passportNumber: updateData.passportNumber },
      });

      if (duplicatePatientByPassport) {
        return res.status(400).json({
          success: false,
          message: 'Patient with this passport number already exists',
          data: { existingPatientId: duplicatePatientByPassport.id }
        });
      }
    }

    // Update patient
    const updatedPatient = await prisma.patient.update({
      where: { id },
      data: updateData,
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_PATIENT',
      tableName: 'patients',
      recordId: id,
      oldValue: existingPatient,
      newValue: updatedPatient,
    });

    res.json({
      success: true,
      message: 'Patient updated successfully',
      data: { patient: updatedPatient },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    console.error('Update patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete patient
export const deletePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { force } = req.query; // Allow force delete with ?force=true

    // Check if patient exists
    const existingPatient = await prisma.patient.findUnique({
      where: { id },
    });

    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Check if patient has related records
    const [appointments, consultations, prescriptions, labTests, bills, admissions, inpatientBills, dischargeSummaries] = await Promise.all([
      prisma.appointment.count({ where: { patientId: id } }),
      prisma.consultation.count({ where: { patientId: id } }),
      prisma.prescription.count({ where: { patientId: id } }),
      prisma.labTest.count({ where: { patientId: id } }),
      prisma.bill.count({ where: { patientId: id } }),
      prisma.admission.count({ where: { patientId: id } }),
      prisma.inpatientBill.count({ where: { patientId: id } }),
      prisma.dischargeSummary.count({ where: { patientId: id } }),
    ]);

    const hasRelatedRecords = appointments > 0 || consultations > 0 || prescriptions > 0 || labTests > 0 ||
      bills > 0 || admissions > 0 || inpatientBills > 0 || dischargeSummaries > 0;

    // If force delete is requested, allow deletion with cascade (schema has onDelete: Cascade)
    if (hasRelatedRecords && force !== 'true') {
      const recordCounts = {
        appointments,
        consultations,
        prescriptions,
        labTests,
        bills,
        admissions,
        inpatientBills,
        dischargeSummaries,
      };

      const recordTypes = Object.entries(recordCounts)
        .filter(([_, count]) => count > 0)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

      return res.status(400).json({
        success: false,
        message: `Cannot delete patient with existing medical records. Found: ${recordTypes}. Use force=true to delete all related records.`,
        data: recordCounts,
        canForceDelete: true, // Indicate that force delete is available
      });
    }

    // Log warning if force deleting with related records
    if (hasRelatedRecords && force === 'true') {
      console.warn(`⚠️ Force deleting patient ${id} with related records:`, {
        appointments,
        consultations,
        prescriptions,
        labTests,
        bills,
        admissions,
        inpatientBills,
        dischargeSummaries,
      });
    }

    // Delete patient (this will cascade delete related records due to onDelete: Cascade in schema)
    await prisma.patient.delete({
      where: { id },
    });

    console.log(`✅ Patient deleted successfully: ${id}`);

    // Log the action (with error handling to prevent deletion failure)
    try {
      await logAudit({
        userId: req.user!.id,
        action: 'DELETE_PATIENT',
        tableName: 'patients',
        recordId: id,
        oldValue: existingPatient,
      });
    } catch (auditError) {
      console.warn('Failed to create audit log for patient deletion:', auditError);
      // Don't fail the deletion if audit log creation fails
    }

    res.json({
      success: true,
      message: 'Patient deleted successfully',
    });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Search patients by phone number
export const searchPatientByPhone = async (req: AuthRequest, res: Response) => {
  try {
    const { phone } = req.params;

    if (!phone || phone.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be at least 3 characters',
      });
    }

    const patients = await prisma.patient.findMany({
      where: {
        phone: { contains: phone },
      },
      select: {
        id: true,
        name: true,
        age: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        address: true,
        bloodGroup: true,
        referredBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      success: true,
      data: {
        patients,
      },
    });
  } catch (error) {
    console.error('Search patient by phone error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get patient statistics
export const getPatientStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalPatients,
      patientsByGender,
      patientsByAgeGroup,
      recentPatients,
    ] = await Promise.all([
      prisma.patient.count(),
      prisma.patient.groupBy({
        by: ['gender'],
        _count: { gender: true },
      }),
      prisma.patient.findMany({
        select: { age: true },
      }).then(patients => {
        const ageGroups: Record<string, number> = {
          'Under 18': 0,
          '18-30': 0,
          '31-50': 0,
          '51-70': 0,
          'Over 70': 0,
        };
        
        patients.forEach(patient => {
          const age = patient.age;
          if (age < 18) {
            ageGroups['Under 18']++;
          } else if (age <= 30) {
            ageGroups['18-30']++;
          } else if (age <= 50) {
            ageGroups['31-50']++;
          } else if (age <= 70) {
            ageGroups['51-70']++;
          } else {
            ageGroups['Over 70']++;
          }
        });
        
        return Object.entries(ageGroups).map(([age_group, count]) => ({
          age_group,
          count,
        }));
      }),
      prisma.patient.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalPatients,
        patientsByGender,
        patientsByAgeGroup,
        recentPatients,
      },
    });
  } catch (error) {
    console.error('Get patient stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
