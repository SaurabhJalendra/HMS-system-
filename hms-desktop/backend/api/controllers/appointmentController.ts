import { Response } from 'express';
import { PrismaClient, AppointmentStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/auditLogger';
import { findPastSlotError } from '../utils/appointmentTime';

const prisma = new PrismaClient();

// Validation schemas
const appointmentCreateSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  doctorId: z.string().min(1, 'Doctor ID is required'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  status: z.nativeEnum(AppointmentStatus).optional(),
});

const appointmentUpdateSchema = z.object({
  doctorId: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
});

const blankToUndefined = (value: unknown) =>
  value === '' || value === null ? undefined : value;

export const appointmentSearchSchema = z.object({
  patientId: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  doctorId: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  date: z.preprocess(blankToUndefined, z.string().optional()),
  status: z.preprocess(blankToUndefined, z.nativeEnum(AppointmentStatus).optional()),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(200).optional().default(20),
});

// Create new appointment
export const createAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = appointmentCreateSchema.parse(req.body);

    // Verify patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: validatedData.patientId },
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Verify doctor exists and has DOCTOR role
    const doctor = await prisma.user.findUnique({
      where: { id: validatedData.doctorId },
    });

    if (!doctor || doctor.role !== UserRole.DOCTOR) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found or invalid role',
      });
    }

    // Reject slots that already passed today (the same time on a later day is fine)
    const pastSlotError = await findPastSlotError(validatedData.date, validatedData.time);
    if (pastSlotError) {
      return res.status(400).json({
        success: false,
        message: pastSlotError,
      });
    }

    // Check for appointment conflicts (same doctor, same date/time)
    // Normalize date to start of day for accurate comparison
    const appointmentDate = new Date(validatedData.date);
    appointmentDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(appointmentDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const conflictingAppointment = await prisma.appointment.findFirst({
      where: {
        doctorId: validatedData.doctorId,
        date: {
          gte: appointmentDate,
          lt: nextDay,
        },
        time: validatedData.time,
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
      },
    });

    if (conflictingAppointment) {
      return res.status(400).json({
        success: false,
        message: 'Doctor is not available at this time slot',
        data: { conflictingAppointmentId: conflictingAppointment.id },
      });
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        ...validatedData,
        date: new Date(validatedData.date),
        status: validatedData.status || AppointmentStatus.SCHEDULED,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
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
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_APPOINTMENT',
      tableName: 'appointments',
      recordId: appointment.id,
      newValue: appointment,
    });

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: { appointment },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Create appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all appointments with search and pagination
export const getAppointments = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId, doctorId, date, status, page = 1, limit = 20 } = appointmentSearchSchema.parse(req.query);
    
    const skip = (page - 1) * limit;
    
    // Build where clause
    const where: any = {};
    
    // If user is a DOCTOR, automatically filter by their doctorId
    // Only ADMIN and other roles can see all appointments
    if (req.user && req.user.role === UserRole.DOCTOR) {
      where.doctorId = req.user.id;
    } else if (doctorId) {
      // For non-doctors, allow filtering by doctorId if provided
      where.doctorId = doctorId;
    }
    
    if (patientId) {
      where.patientId = patientId;
    }
    
    if (date) {
      const searchDate = new Date(date);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      where.date = {
        gte: searchDate,
        lt: nextDay,
      };
    }
    
    if (status) {
      where.status = status;
    }

    // Get appointments with pagination
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { date: 'asc' },
          { time: 'asc' },
        ],
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
              allergies: true,
              chronicConditions: true,
              consultations: {
                select: {
                  id: true,
                  diagnosis: true,
                  notes: true,
                  consultationDate: true,
                  createdAt: true,
                  doctor: { select: { fullName: true } },
                },
                orderBy: { consultationDate: 'desc' },
                take: 5,
              },
            },
          },
          doctor: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          // OPD queue: at most one consultation / prescription per visit for UI state
          consultations: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, heldUntil: true },
          },
          prescriptions: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, prescriptionNumber: true, status: true },
          },
        },
      }),
      prisma.appointment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        appointments,
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
    
    console.error('Get appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get appointment by ID
export const getAppointmentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
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
          },
        },
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        consultations: {
          orderBy: { createdAt: 'desc' },
          include: {
            doctor: {
              select: { fullName: true },
            },
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

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    // If user is a DOCTOR, ensure they can only access their own appointments
    if (req.user && req.user.role === UserRole.DOCTOR && appointment.doctorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own appointments.',
      });
    }

    res.json({
      success: true,
      data: { appointment },
    });
  } catch (error) {
    console.error('Get appointment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update appointment
export const updateAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = appointmentUpdateSchema.parse(req.body);

    // Check if appointment exists
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    // If user is a DOCTOR, ensure they can only update their own appointments
    if (req.user && req.user.role === UserRole.DOCTOR && existingAppointment.doctorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own appointments.',
      });
    }

    // If updating date/time, check for conflicts
    if (validatedData.date || validatedData.time || validatedData.doctorId) {
      const newDate = validatedData.date ? new Date(validatedData.date) : existingAppointment.date;
      const newTime = validatedData.time || existingAppointment.time;
      const newDoctorId = validatedData.doctorId || existingAppointment.doctorId;

      // Re-scheduling into a slot that already passed today is not allowed
      if (validatedData.date || validatedData.time) {
        const pastSlotError = await findPastSlotError(
          validatedData.date || newDate,
          newTime
        );
        if (pastSlotError) {
          return res.status(400).json({
            success: false,
            message: pastSlotError,
          });
        }
      }

      // Normalize date to start of day for accurate comparison
      const appointmentDate = new Date(newDate);
      appointmentDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(appointmentDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const conflictingAppointment = await prisma.appointment.findFirst({
        where: {
          id: { not: id },
          doctorId: newDoctorId,
          date: {
            gte: appointmentDate,
            lt: nextDay,
          },
          time: newTime,
          status: {
            notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
          },
        },
      });

      if (conflictingAppointment) {
        return res.status(400).json({
          success: false,
          message: 'Doctor is not available at this time slot',
          data: { conflictingAppointmentId: conflictingAppointment.id },
        });
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (validatedData.date) updateData.date = new Date(validatedData.date);
    if (validatedData.time) updateData.time = validatedData.time;
    if (validatedData.status) updateData.status = validatedData.status;
    if (validatedData.doctorId) updateData.doctorId = validatedData.doctorId;

    // Update appointment
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
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
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_APPOINTMENT',
      tableName: 'appointments',
      recordId: id,
      oldValue: existingAppointment,
      newValue: updatedAppointment,
    });

    res.json({
      success: true,
      message: 'Appointment updated successfully',
      data: { appointment: updatedAppointment },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Update appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete appointment
export const deleteAppointment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if appointment exists
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    // If user is a DOCTOR, ensure they can only delete their own appointments
    if (req.user && req.user.role === UserRole.DOCTOR && existingAppointment.doctorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own appointments.',
      });
    }

    // Check if appointment has related records
    const [consultations, prescriptions] = await Promise.all([
      prisma.consultation.count({ where: { appointmentId: id } }),
      prisma.prescription.count({ where: { appointmentId: id } }),
    ]);

    const hasRelatedRecords = consultations > 0 || prescriptions > 0;

    if (hasRelatedRecords) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete appointment with existing consultations or prescriptions',
        data: {
          consultations,
          prescriptions,
        },
      });
    }

    // Delete appointment
    await prisma.appointment.delete({
      where: { id },
    });

    // Log the action (with error handling to prevent deletion failure)
    try {
      await logAudit({
        userId: req.user!.id,
        action: 'DELETE_APPOINTMENT',
        tableName: 'appointments',
        recordId: id,
        oldValue: existingAppointment,
      });
    } catch (auditError) {
      console.warn('Failed to create audit log for appointment deletion:', auditError);
      // Don't fail the deletion if audit log creation fails
    }

    res.json({
      success: true,
      message: 'Appointment deleted successfully',
    });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get available doctors
export const getAvailableDoctors = async (req: AuthRequest, res: Response) => {
  try {
    const doctors = await prisma.user.findMany({
      where: {
        role: UserRole.DOCTOR,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        createdAt: true,
      },
      orderBy: { fullName: 'asc' },
    });

    res.json({
      success: true,
      data: { doctors },
    });
  } catch (error) {
    console.error('Get available doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get appointment statistics
export const getAppointmentStats = async (req: AuthRequest, res: Response) => {
  try {
    // Build base where clause for doctor filtering
    const baseWhere: any = {};
    if (req.user && req.user.role === UserRole.DOCTOR) {
      baseWhere.doctorId = req.user.id;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      totalAppointments,
      appointmentsByStatus,
      todayAppointments,
      upcomingAppointments,
    ] = await Promise.all([
      prisma.appointment.count({ where: baseWhere }),
      prisma.appointment.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { status: true },
      }),
      prisma.appointment.count({
        where: {
          ...baseWhere,
          date: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      }),
      prisma.appointment.count({
        where: {
          ...baseWhere,
          date: {
            gte: new Date(),
          },
          status: {
            in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalAppointments,
        appointmentsByStatus,
        todayAppointments,
        upcomingAppointments,
      },
    });
  } catch (error) {
    console.error('Get appointment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
