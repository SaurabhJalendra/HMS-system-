import { Response } from 'express';
import { logAudit } from '../utils/auditLogger';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { resolveConsultationFee } from '../utils/hospitalHelper';

const prisma = new PrismaClient();

// Validation schemas
const consultationCreateSchema = z.object({
  appointmentId: z.string().min(1, 'Appointment ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  doctorId: z.string().min(1, 'Doctor ID is required'),
  diagnosis: z.string().min(1, 'Diagnosis is required').max(1000, 'Diagnosis too long'),
  notes: z.string().max(2000, 'Notes too long').optional(),
  /** ISO 8601 datetime — when set, visit stays on hold (e.g. awaiting lab); appointment stays IN_PROGRESS. */
  heldUntil: z.string().optional(),
});

const consultationUpdateSchema = z.object({
  diagnosis: z.string().min(1, 'Diagnosis is required').max(1000, 'Diagnosis too long').optional(),
  notes: z.string().max(2000, 'Notes too long').optional(),
  /** Pass null to clear hold and allow completing the visit (appointment → COMPLETED). */
  heldUntil: z.union([z.string(), z.null()]).optional(),
});

const consultationSearchSchema = z.object({
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
  appointmentId: z.string().optional(),
  search: z.string().optional(), // Search in diagnosis or notes
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => parseInt(val) || 20).optional(),
});

// Create new consultation
export const createConsultation = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = consultationCreateSchema.parse(req.body);

    // Verify appointment exists
    const appointment = await prisma.appointment.findUnique({
      where: { id: validatedData.appointmentId },
      include: {
        patient: true,
        doctor: true,
      },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    // Verify patient and doctor match the appointment
    if (appointment.patientId !== validatedData.patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID does not match appointment',
      });
    }

    if (appointment.doctorId !== validatedData.doctorId) {
      return res.status(400).json({
        success: false,
        message: 'Doctor ID does not match appointment',
      });
    }

    // Appointment must be with a clinician user (DOCTOR or ADMIN who also sees patients)
    if (
      appointment.doctor.role !== UserRole.DOCTOR &&
      appointment.doctor.role !== UserRole.ADMIN
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor role for this appointment',
      });
    }

    // Check if consultation already exists for this appointment
    const existingConsultation = await prisma.consultation.findFirst({
      where: { appointmentId: validatedData.appointmentId },
    });

    if (existingConsultation) {
      return res.status(400).json({
        success: false,
        message: 'Consultation already exists for this appointment',
        data: { existingConsultationId: existingConsultation.id },
      });
    }

    const fee = await resolveConsultationFee(appointment.doctor?.consultationFee);

    const { heldUntil: heldUntilRaw, ...consultationRest } = validatedData;
    let heldUntil: Date | null = null;
    if (heldUntilRaw) {
      heldUntil = new Date(heldUntilRaw);
      if (Number.isNaN(heldUntil.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid heldUntil datetime',
        });
      }
    }

    // Create consultation
    const consultation = await prisma.consultation.create({
      data: {
        ...consultationRest,
        heldUntil,
        fee,
        consultationDate: new Date(),
      },
      include: {
        appointment: {
          select: {
            id: true,
            date: true,
            time: true,
            status: true,
          },
        },
        patient: {
          select: {
            id: true,
            name: true,
            dateOfBirth: true,
            gender: true,
            phone: true,
            bloodGroup: true,
            allergies: true,
            chronicConditions: true,
          },
        },
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Held consultations keep the slot active until the doctor finishes (prescription path).
    await prisma.appointment.update({
      where: { id: validatedData.appointmentId },
      data: { status: heldUntil ? 'IN_PROGRESS' : 'COMPLETED' },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_CONSULTATION',
      tableName: 'consultations',
      recordId: consultation.id,
      newValue: consultation,
    });

    res.status(201).json({
      success: true,
      message: 'Consultation created successfully',
      data: { consultation },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Create consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all consultations with search and pagination
export const getConsultations = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId, doctorId, appointmentId, search, page = 1, limit = 20 } = consultationSearchSchema.parse(req.query);
    
    const skip = (page - 1) * limit;
    
    // Build where clause
    const where: any = {};
    
    if (patientId) {
      where.patientId = patientId;
    }
    
    if (doctorId) {
      where.doctorId = doctorId;
    }
    
    if (appointmentId) {
      where.appointmentId = appointmentId;
    }
    
    if (search) {
      where.OR = [
        { diagnosis: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get consultations with pagination
    const [consultations, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { consultationDate: 'desc' },
        include: {
          appointment: {
            select: {
              id: true,
              date: true,
              time: true,
              status: true,
            },
          },
          patient: {
            select: {
              id: true,
              name: true,
              dateOfBirth: true,
              gender: true,
              phone: true,
              bloodGroup: true,
            },
          },
          doctor: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      prisma.consultation.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        consultations,
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
    
    console.error('Get consultations error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get consultation by ID
export const getConsultationById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        appointment: {
          select: {
            id: true,
            date: true,
            time: true,
            status: true,
          },
        },
        patient: {
          select: {
            id: true,
            name: true,
            dateOfBirth: true,
            gender: true,
            phone: true,
            address: true,
            bloodGroup: true,
            allergies: true,
            chronicConditions: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
          },
        },
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        prescriptions: {
          orderBy: { createdAt: 'desc' },
          include: {
            doctor: {
              select: { fullName: true },
            },
          },
        },
      },
    });

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found',
      });
    }

    res.json({
      success: true,
      data: { consultation },
    });
  } catch (error) {
    console.error('Get consultation by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update consultation
export const updateConsultation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = consultationUpdateSchema.parse(req.body);

    // Check if consultation exists
    const existingConsultation = await prisma.consultation.findUnique({
      where: { id },
    });

    if (!existingConsultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found',
      });
    }

    const updatePayload: {
      diagnosis?: string;
      notes?: string | null;
      heldUntil?: Date | null;
    } = {};

    if (validatedData.diagnosis !== undefined) {
      updatePayload.diagnosis = validatedData.diagnosis;
    }
    if (validatedData.notes !== undefined) {
      updatePayload.notes = validatedData.notes;
    }
    if (validatedData.heldUntil !== undefined) {
      if (validatedData.heldUntil === null) {
        updatePayload.heldUntil = null;
      } else {
        const d = new Date(validatedData.heldUntil);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid heldUntil datetime',
          });
        }
        updatePayload.heldUntil = d;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    // Update consultation
    const updatedConsultation = await prisma.consultation.update({
      where: { id },
      data: updatePayload,
      include: {
        appointment: {
          select: {
            id: true,
            date: true,
            time: true,
            status: true,
          },
        },
        patient: {
          select: {
            id: true,
            name: true,
            dateOfBirth: true,
            gender: true,
            phone: true,
            bloodGroup: true,
          },
        },
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_CONSULTATION',
      tableName: 'consultations',
      recordId: id,
      oldValue: existingConsultation,
      newValue: updatedConsultation,
    });

    if (
      Object.prototype.hasOwnProperty.call(validatedData, 'heldUntil') &&
      validatedData.heldUntil === null
    ) {
      await prisma.appointment.update({
        where: { id: existingConsultation.appointmentId },
        data: { status: 'COMPLETED' },
      });
    }

    res.json({
      success: true,
      message: 'Consultation updated successfully',
      data: { consultation: updatedConsultation },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Update consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete consultation
export const deleteConsultation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if consultation exists
    const existingConsultation = await prisma.consultation.findUnique({
      where: { id },
    });

    if (!existingConsultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found',
      });
    }

    // Check if consultation has related prescriptions
    const prescriptions = await prisma.prescription.count({ 
      where: { consultationId: id }
    });

    if (prescriptions > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete consultation with existing prescriptions',
        data: { prescriptions },
      });
    }

    // Delete consultation
    await prisma.consultation.delete({
      where: { id },
    });

    // Log the action (with error handling to prevent deletion failure)
    try {
      await logAudit({
        userId: req.user!.id,
        action: 'DELETE_CONSULTATION',
        tableName: 'consultations',
        recordId: id,
        oldValue: existingConsultation,
      });
    } catch (auditError) {
      console.warn('Failed to create audit log for consultation deletion:', auditError);
      // Don't fail the deletion if audit log creation fails
    }

    res.json({
      success: true,
      message: 'Consultation deleted successfully',
    });
  } catch (error) {
    console.error('Delete consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get consultation statistics
export const getConsultationStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalConsultations,
      consultationsByDoctor,
      recentConsultations,
      todayConsultations,
    ] = await Promise.all([
      prisma.consultation.count(),
      prisma.consultation.groupBy({
        by: ['doctorId'],
        _count: { doctorId: true },
        orderBy: { _count: { doctorId: 'desc' } },
        take: 10,
      }),
      prisma.consultation.count({
        where: {
          consultationDate: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
      prisma.consultation.count({
        where: {
          consultationDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
    ]);

    // Get doctor names for the consultationsByDoctor data
    const doctorIds = consultationsByDoctor.map(item => item.doctorId);
    const doctors = await prisma.user.findMany({
      where: { id: { in: doctorIds } },
      select: { id: true, fullName: true },
    });

    const consultationsByDoctorWithNames = consultationsByDoctor.map(item => ({
      ...item,
      doctorName: doctors.find(doc => doc.id === item.doctorId)?.fullName || 'Unknown Doctor',
    }));

    res.json({
      success: true,
      data: {
        totalConsultations,
        consultationsByDoctor: consultationsByDoctorWithNames,
        recentConsultations,
        todayConsultations,
      },
    });
  } catch (error) {
    console.error('Get consultation stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
