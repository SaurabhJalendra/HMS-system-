import { Response } from 'express';
import { logAudit } from '../utils/auditLogger';
import { PrismaClient, LabTestStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Validation schemas
const labTestCreateSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  orderedBy: z.string().min(1, 'Ordered by (Doctor/Lab Tech ID) is required'),
  testCatalogId: z.string().min(1, 'Test catalog ID is required'),
  notes: z.string().optional(),
  consultationId: z.string().optional(),
  appointmentId: z.string().optional(),
});

const labTestUpdateSchema = z.object({
  status: z.nativeEnum(LabTestStatus).optional(),
  scheduledDate: z.string().optional(),
  results: z.string().optional(),
  reportFile: z.string().optional(),
  notes: z.string().optional(),
  performedBy: z.string().optional(),
});

const labTestSearchSchema = z.object({
  patientId: z.string().optional(),
  orderedBy: z.string().optional(),
  performedBy: z.string().optional(),
  status: z.nativeEnum(LabTestStatus).optional(),
  testCatalogId: z.string().optional(),
  category: z.string().optional(),
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => parseInt(val) || 20).optional(),
});

// Test catalog validation schemas
const testCatalogCreateSchema = z.object({
  testName: z.string().min(1, 'Test name is required').max(200, 'Test name too long'),
  description: z.string().optional(),
  category: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  units: z.string().optional(),
  referenceRange: z.string().optional(),
  isActive: z.boolean().optional(),
});

const testCatalogUpdateSchema = z.object({
  testName: z.string().min(1, 'Test name is required').max(200, 'Test name too long').optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  price: z.number().positive('Price must be positive').optional(),
  units: z.string().optional(),
  referenceRange: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Technician test selection schemas
const technicianTestSelectionSchema = z.object({
  technicianId: z.string()
    .min(1, 'Technician ID is required')
    .refine((val) => val && val.trim().length > 0, {
      message: 'Technician ID cannot be empty',
    }),
  // Allow empty array so a technician can clear all selections
  // Handle both undefined (use default []) and explicit empty array
  testCatalogIds: z.preprocess(
    (val) => {
      // Handle various input formats
      if (val === undefined || val === null) return [];
      if (Array.isArray(val)) {
        // Filter out invalid values and ensure all are strings
        return val.filter(id => id != null && String(id).trim().length > 0).map(id => String(id).trim());
      }
      // If it's a single value, convert to array
      if (typeof val === 'string' && val.trim().length > 0) {
        return [val.trim()];
      }
      return [];
    },
    z.array(z.string().min(1, 'Test catalog ID cannot be empty'))
  ),
  labType: z.string()
    .min(1, 'Lab type is required')
    .refine((val) => ['General', 'MRI', 'CT Scan', 'X-Ray', 'Ultrasound', 'Pathology'].includes(val), {
      message: 'Lab type must be one of: General, MRI, CT Scan, X-Ray, Ultrasound, Pathology',
    }),
});

// Create new lab test order
export const createLabTest = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = labTestCreateSchema.parse(req.body);

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

    // Verify test catalog exists and is active
    const testCatalog = await prisma.testCatalog.findUnique({
      where: { id: validatedData.testCatalogId },
    });

    if (!testCatalog) {
      return res.status(404).json({
        success: false,
        message: 'Test not found in catalog',
      });
    }

    if (!testCatalog.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Test is not active in catalog',
      });
    }

    // Verify ordering user exists and has appropriate role
    const orderingUser = await prisma.user.findUnique({
      where: { 
        id: validatedData.orderedBy,
        isActive: true 
      },
    });

    if (!orderingUser) {
      return res.status(404).json({
        success: false,
        message: 'Ordering user not found or inactive',
      });
    }

    let consultationIdLink: string | undefined;
    let appointmentIdLink: string | undefined;

    if (validatedData.consultationId) {
      const consultation = await prisma.consultation.findUnique({
        where: { id: validatedData.consultationId },
      });
      if (!consultation) {
        return res.status(404).json({ success: false, message: 'Consultation not found' });
      }
      if (consultation.patientId !== validatedData.patientId) {
        return res.status(400).json({
          success: false,
          message: 'Consultation does not match patient',
        });
      }
      if (consultation.doctorId !== validatedData.orderedBy) {
        return res.status(403).json({
          success: false,
          message: 'Only the consulting doctor can link lab orders to this consultation',
        });
      }
      consultationIdLink = consultation.id;
      appointmentIdLink = consultation.appointmentId;
      if (
        validatedData.appointmentId &&
        validatedData.appointmentId !== consultation.appointmentId
      ) {
        return res.status(400).json({
          success: false,
          message: 'Appointment ID does not match consultation',
        });
      }
    } else if (validatedData.appointmentId) {
      const appt = await prisma.appointment.findUnique({
        where: { id: validatedData.appointmentId },
      });
      if (!appt || appt.patientId !== validatedData.patientId) {
        return res.status(400).json({
          success: false,
          message: 'Appointment not found or does not match patient',
        });
      }
      appointmentIdLink = validatedData.appointmentId;
    }

    // Create lab test
    const labTest = await prisma.labTest.create({
      data: {
        patientId: validatedData.patientId,
        orderedBy: validatedData.orderedBy,
        testCatalogId: validatedData.testCatalogId,
        testNameSnapshot: testCatalog.testName,
        priceSnapshot: testCatalog.price,
        status: 'PENDING',
        results: null,
        notes: validatedData.notes ?? null,
        consultationId: consultationIdLink ?? null,
        appointmentId: appointmentIdLink ?? null,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        orderedByUser: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        testCatalog: {
          select: {
            id: true,
            testName: true,
            description: true,
            price: true,
          },
        },
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_LAB_TEST',
      tableName: 'lab_tests',
      recordId: labTest.id,
      newValue: labTest,
    });

    res.status(201).json({
      success: true,
      message: 'Lab test ordered successfully',
      data: { labTest },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Create lab test error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all lab tests with search and pagination
export const getLabTests = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId, orderedBy, performedBy, status, testCatalogId, category, page = 1, limit = 20 } = labTestSearchSchema.parse(req.query);
    
    const skip = (page - 1) * limit;
    
    // Build where clause
    const where: any = {};
    
    if (patientId) {
      where.patientId = patientId;
    }
    
    if (orderedBy) {
      where.orderedBy = orderedBy;
    }
    
    if (performedBy) {
      where.performedBy = performedBy;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (testCatalogId) {
      where.testCatalogId = testCatalogId;
    }

    if (category) {
      where.testCatalog = {
        category: category
      };
    }

    // Get lab tests with pagination
    const [labTests, total] = await Promise.all([
      prisma.labTest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              phone: true,
              dateOfBirth: true,
              gender: true,
            },
          },
          orderedByUser: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          performedByUser: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          testCatalog: {
            select: {
              id: true,
              testName: true,
              description: true,
              category: true,
              price: true,
              units: true,
              referenceRange: true,
            },
          },
        },
      }),
      prisma.labTest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        labTests,
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
    
    console.error('Get lab tests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get lab test by ID
export const getLabTestById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const labTest = await prisma.labTest.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
            address: true,
            bloodGroup: true,
            allergies: true,
            chronicConditions: true,
          },
        },
        orderedByUser: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        testCatalog: {
          select: {
            id: true,
            testName: true,
            description: true,
            price: true,
          },
        },
      },
    });

    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found',
      });
    }

    res.json({
      success: true,
      data: { labTest },
    });
  } catch (error) {
    console.error('Get lab test by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update lab test (for status changes and results)
export const updateLabTest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = labTestUpdateSchema.parse(req.body);

    // Check if lab test exists
    const existingLabTest = await prisma.labTest.findUnique({
      where: { id },
    });

    if (!existingLabTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found',
      });
    }

    if (validatedData.status === 'CANCELLED') {
      if (existingLabTest.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          message: 'Completed lab tests cannot be cancelled',
        });
      }
      if (existingLabTest.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Lab test is already cancelled',
        });
      }
    }

    // Prepare update data
    const updateData: any = { ...validatedData };
    
    // If scheduledDate is provided as string, convert to Date
    if (validatedData.scheduledDate) {
      updateData.scheduledDate = new Date(validatedData.scheduledDate);
    }
    
    // If status is being changed to COMPLETED, set completedAt and performedBy
    if (validatedData.status === 'COMPLETED' && existingLabTest.status !== 'COMPLETED') {
      updateData.completedAt = new Date();
      // If performedBy is not provided, use the current user (lab technician)
      if (!validatedData.performedBy) {
        updateData.performedBy = req.user!.id;
      }
    }

    // Update lab test
    const updatedLabTest = await prisma.labTest.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        orderedByUser: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        testCatalog: {
          select: {
            id: true,
            testName: true,
            description: true,
            price: true,
          },
        },
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_LAB_TEST',
      tableName: 'lab_tests',
      recordId: id,
      oldValue: existingLabTest,
      newValue: updatedLabTest,
    });

    res.json({
      success: true,
      message: 'Lab test updated successfully',
      data: { labTest: updatedLabTest },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Update lab test error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get lab test statistics
export const getLabTestStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalLabTests,
      labTestsByStatus,
      labTestsByTest,
      recentLabTests,
      labTestsByDoctorRaw,
    ] = await Promise.all([
      prisma.labTest.count(),
      prisma.labTest.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.labTest.groupBy({
        by: ['testCatalogId'],
        _count: { testCatalogId: true },
      }),
      prisma.labTest.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      prisma.labTest.groupBy({
        by: ['orderedBy'],
        _count: { orderedBy: true },
      }),
    ]);

    const doctorIds = labTestsByDoctorRaw.map((r) => r.orderedBy).filter(Boolean);
    const doctors = doctorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: doctorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d.fullName || d.id]));

    const labTestsByDoctor = labTestsByDoctorRaw.map((r) => ({
      orderedBy: r.orderedBy,
      doctorName: doctorMap[r.orderedBy] || r.orderedBy,
      count: r._count.orderedBy,
    }));

    res.json({
      success: true,
      data: {
        totalLabTests,
        labTestsByStatus,
        labTestsByTest,
        recentLabTests,
        labTestsByDoctor,
      },
    });
  } catch (error) {
    console.error('Get lab test stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get pending lab tests for lab technicians
export const getPendingLabTests = async (req: AuthRequest, res: Response) => {
  try {
    const pendingLabTests = await prisma.labTest.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        orderedByUser: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        testCatalog: {
          select: {
            id: true,
            testName: true,
            description: true,
            price: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: { labTests: pendingLabTests },
    });
  } catch (error) {
    console.error('Get pending lab tests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Test Catalog Management

// Get all test catalog items
export const getTestCatalog = async (req: AuthRequest, res: Response) => {
  try {
    const { isActive } = req.query;
    
    const where: any = {};
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const testCatalog = await prisma.testCatalog.findMany({
      where,
      orderBy: { testName: 'asc' },
    });

    res.json({
      success: true,
      data: { testCatalog },
    });
  } catch (error) {
    console.error('Get test catalog error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Create new test catalog item
export const createTestCatalogItem = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = testCatalogCreateSchema.parse(req.body);

    // Check if test name already exists
    const existingTest = await prisma.testCatalog.findUnique({
      where: { testName: validatedData.testName },
    });

    if (existingTest) {
      return res.status(400).json({
        success: false,
        message: 'Test with this name already exists',
      });
    }

    // Create test catalog item
    const testCatalogItem = await prisma.testCatalog.create({
      data: {
        ...validatedData,
        isActive: validatedData.isActive !== undefined ? validatedData.isActive : true,
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_TEST_CATALOG',
      tableName: 'test_catalog',
      recordId: testCatalogItem.id,
      newValue: testCatalogItem,
    });

    res.status(201).json({
      success: true,
      message: 'Test catalog item created successfully',
      data: { testCatalogItem },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Create test catalog item error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update test catalog item
export const updateTestCatalogItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = testCatalogUpdateSchema.parse(req.body);

    // Check if test catalog item exists
    const existingItem = await prisma.testCatalog.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Test catalog item not found',
      });
    }

    // Check for duplicate test name if name is being updated
    if (validatedData.testName && validatedData.testName !== existingItem.testName) {
      const duplicateTest = await prisma.testCatalog.findUnique({
        where: { testName: validatedData.testName },
      });

      if (duplicateTest) {
        return res.status(400).json({
          success: false,
          message: 'Test with this name already exists',
        });
      }
    }

    // Update test catalog item
    const updatedItem = await prisma.testCatalog.update({
      where: { id },
      data: validatedData,
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_TEST_CATALOG',
      tableName: 'test_catalog',
      recordId: id,
      oldValue: existingItem,
      newValue: updatedItem,
    });

    res.json({
      success: true,
      message: 'Test catalog item updated successfully',
      data: { testCatalogItem: updatedItem },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Update test catalog item error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get scheduled lab tests for a specific date
export const getScheduledLabTests = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required',
      });
    }

    const startOfDay = new Date(date as string);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date as string);
    endOfDay.setHours(23, 59, 59, 999);

    const scheduledTests = await prisma.labTest.findMany({
      where: {
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        orderedByUser: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        testCatalog: {
          select: {
            id: true,
            testName: true,
            description: true,
            price: true,
          },
        },
      },
      orderBy: {
        scheduledDate: 'asc',
      },
    });

    res.json({
      success: true,
      data: { labTests: scheduledTests },
    });
  } catch (error) {
    console.error('Get scheduled lab tests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get advanced lab test report
export const getLabTestReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);

    const [
      totalTests,
      completedTests,
      pendingTests,
      inProgressTests,
      cancelledTests,
      totalRevenue,
      testsByStatus,
      testsByTestType,
    ] = await Promise.all([
      prisma.labTest.count({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
      prisma.labTest.count({
        where: {
          status: 'COMPLETED',
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
      prisma.labTest.count({
        where: {
          status: 'PENDING',
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
      prisma.labTest.count({
        where: {
          status: 'IN_PROGRESS',
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
      prisma.labTest.count({
        where: {
          status: 'CANCELLED',
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
      prisma.labTest.aggregate({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        _sum: {
          priceSnapshot: true,
        },
      }),
      prisma.labTest.groupBy({
        by: ['status'],
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        _count: {
          status: true,
        },
      }),
      prisma.labTest.groupBy({
        by: ['testCatalogId'],
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        _count: {
          testCatalogId: true,
        },
        _sum: {
          priceSnapshot: true,
        },
      }),
    ]);

    // Get test names for the breakdown
    const testTypeDetails = await Promise.all(
      testsByTestType.map(async (item) => {
        const testCatalog = await prisma.testCatalog.findUnique({
          where: { id: item.testCatalogId },
          select: {
            testName: true,
            description: true,
          },
        });
        return {
          testId: item.testCatalogId,
          testName: testCatalog?.testName || 'Unknown Test',
          count: item._count.testCatalogId,
          totalRevenue: Number(item._sum.priceSnapshot) || 0,
        };
      })
    );

    res.json({
      success: true,
      data: {
        report: {
          totalTests,
          completedTests,
          pendingTests,
          inProgressTests,
          cancelledTests,
          totalRevenue: Number(totalRevenue._sum.priceSnapshot) || 0,
        },
        testsByStatus,
        testsByTestType: testTypeDetails,
      },
    });
  } catch (error) {
    console.error('Get lab test report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get lab tests by category for report
export const getLabTestsByCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { category, startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);

    let tests;
    
    if (category) {
      // Get tests for a specific test catalog item
      tests = await prisma.labTest.findMany({
        where: {
          testCatalog: {
            testName: {
              contains: category as string,
              mode: 'insensitive',
            },
          },
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              phone: true,
              dateOfBirth: true,
              gender: true,
            },
          },
          orderedByUser: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          testCatalog: {
            select: {
              id: true,
              testName: true,
              description: true,
              price: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } else {
      tests = await prisma.labTest.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              phone: true,
              dateOfBirth: true,
              gender: true,
            },
          },
          orderedByUser: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          testCatalog: {
            select: {
              id: true,
              testName: true,
              description: true,
              price: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }

    res.json({
      success: true,
      data: { labTests: tests },
    });
  } catch (error) {
    console.error('Get lab tests by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// ========== TECHNICIAN TEST SELECTION MANAGEMENT ==========

// Get available tests for technician selection
export const getAvailableTestsForTechnician = async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.query;

    const where: any = { isActive: true };
    if (category) {
      where.category = category;
    }

    const tests = await prisma.testCatalog.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { testName: 'asc' }
      ],
    });

    // Group tests by category
    const testsByCategory = tests.reduce((acc, test) => {
      const category = test.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(test);
      return acc;
    }, {} as Record<string, any[]>);

    res.json({
      success: true,
      data: {
        tests,
        testsByCategory,
        categories: Object.keys(testsByCategory),
      },
    });
  } catch (error) {
    console.error('Get available tests for technician error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get technician's selected tests
export const getTechnicianSelectedTests = async (req: AuthRequest, res: Response) => {
  try {
    const { technicianId } = req.params;

    if (!technicianId || typeof technicianId !== 'string' || technicianId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Technician ID is required',
      });
    }

    const selections = await prisma.technicianTestSelection.findMany({
      where: {
        technicianId: technicianId.trim(),
        // Only include selections where testCatalog exists and is active
        testCatalog: {
          isActive: true,
        },
      },
      include: {
        testCatalog: {
          select: {
            id: true,
            testName: true,
            description: true,
            category: true,
            price: true,
            units: true,
            referenceRange: true,
          },
        },
      },
      orderBy: [
        { labType: 'asc' },
        { createdAt: 'asc' }, // Use createdAt as fallback for ordering
      ],
    });

    // Sort by testName manually after fetching (safer than nested orderBy)
    selections.sort((a, b) => {
      if (a.labType !== b.labType) {
        return a.labType.localeCompare(b.labType);
      }
      const nameA = a.testCatalog?.testName || '';
      const nameB = b.testCatalog?.testName || '';
      return nameA.localeCompare(nameB);
    });

    // Group by lab type - filter out any selections with null testCatalog (deleted tests)
    const testsByLabType = selections.reduce((acc, selection) => {
      // Skip if testCatalog is null (test was deleted)
      if (!selection.testCatalog) {
        return acc;
      }
      const labType = selection.labType;
      if (!acc[labType]) {
        acc[labType] = [];
      }
      acc[labType].push(selection.testCatalog);
      return acc;
    }, {} as Record<string, any[]>);

    res.json({
      success: true,
      data: {
        selections,
        testsByLabType,
        labTypes: Object.keys(testsByLabType),
      },
    });
  } catch (error) {
    console.error('Get technician selected tests error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      technicianId: req.params?.technicianId,
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Set technician's test selections
export const setTechnicianTestSelections = async (req: AuthRequest, res: Response) => {
  try {
    // Log incoming request for debugging (sanitized)
    console.log('Received request to set technician test selections:', {
      technicianId: req.body?.technicianId ? 'provided' : 'missing',
      testCatalogIdsCount: Array.isArray(req.body?.testCatalogIds) ? req.body.testCatalogIds.length : 'not an array',
      labType: req.body?.labType || 'missing',
      userId: req.user?.id || 'not authenticated'
    });

    // Validate authentication
    if (!req.user || !req.user.id) {
      console.error('Unauthenticated request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Validate request body with better error handling
    const validationResult = technicianTestSelectionSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      console.error('Validation error:', JSON.stringify(validationResult.error.issues, null, 2));
      console.error('Request body received:', JSON.stringify({
        technicianId: req.body?.technicianId ? 'provided' : 'missing',
        testCatalogIds: Array.isArray(req.body?.testCatalogIds) 
          ? `array with ${req.body.testCatalogIds.length} items` 
          : typeof req.body?.testCatalogIds,
        labType: req.body?.labType || 'missing'
      }, null, 2));
      
      // Format validation errors for better user feedback
      const formattedErrors = validationResult.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please check your input.',
        errors: formattedErrors,
      });
    }

    const { technicianId, testCatalogIds, labType } = validationResult.data;

    // Additional defensive checks (shouldn't be needed after validation, but safety first)
    if (!technicianId || typeof technicianId !== 'string' || technicianId.trim() === '') {
      console.error('Invalid technicianId after validation:', technicianId);
      return res.status(400).json({
        success: false,
        message: 'Invalid technician ID',
      });
    }

    if (!labType || typeof labType !== 'string' || labType.trim() === '') {
      console.error('Invalid labType after validation:', labType);
      return res.status(400).json({
        success: false,
        message: 'Invalid lab type',
      });
    }

    // Ensure testCatalogIds is an array (should already be from validation)
    const validTestIds = Array.isArray(testCatalogIds) 
      ? testCatalogIds.filter(id => id && typeof id === 'string' && id.trim() !== '')
      : [];

    // Verify technician exists and has LAB_TECH role
    // Note: findUnique only works with @unique fields, so we use findFirst instead
    let technician;
    try {
      technician = await prisma.user.findFirst({
        where: {
          id: technicianId,
          role: 'LAB_TECH',
          isActive: true,
        },
      });
    } catch (dbError: any) {
      console.error('Database error while fetching technician:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database error while verifying technician',
        error: process.env.NODE_ENV !== 'production' ? dbError.message : undefined,
      });
    }

    if (!technician) {
      console.error(`Technician not found: ${technicianId}`);
      return res.status(404).json({
        success: false,
        message: 'Technician not found or does not have lab technician role',
      });
    }

    console.log(`Technician verified: ${technician.fullName} (${technician.id})`);

    // If clearing all selections for this lab type, delete and return early
    if (validTestIds.length === 0) {
      const deletedCount = await prisma.technicianTestSelection.deleteMany({
        where: { 
          technicianId,
          labType: labType
        },
      });

      console.log(`Cleared ${deletedCount.count} selections for technician ${technicianId}, lab type ${labType}`);

      await logAudit({
        userId: req.user!.id,
        action: 'SET_TECHNICIAN_TEST_SELECTIONS',
        tableName: 'technician_test_selections',
        recordId: technicianId,
        newValue: { technicianId, testCatalogIds: [], labType },
      }).catch(err => {
        console.error('Failed to create audit log:', err);
        // Don't fail the request if audit log fails
      });

      return res.json({
        success: true,
        message: 'Technician test selections cleared successfully',
        data: { selections: [] },
      });
    }

    // Verify all test catalog items exist (only if we have tests to validate)
    if (validTestIds.length > 0) {
      try {
        const testCatalogs = await prisma.testCatalog.findMany({
          where: {
            id: { in: validTestIds },
            isActive: true,
          },
        });

        if (testCatalogs.length !== validTestIds.length) {
          const foundIds = testCatalogs.map(t => t.id);
          const missingIds = validTestIds.filter(id => !foundIds.includes(id));
          console.error('Some test catalog items not found:', missingIds);
          return res.status(400).json({
            success: false,
            message: `One or more test catalog items not found or inactive. Missing IDs: ${missingIds.join(', ')}`,
          });
        }
      } catch (validationError: any) {
        console.error('Error validating test catalogs:', validationError);
        return res.status(400).json({
          success: false,
          message: 'Error validating test catalog items',
          error: validationError?.message || 'Unknown validation error',
        });
      }
    }

    // Use transaction to ensure atomicity
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        console.log(`[Transaction] Starting for technician ${technicianId}, lab type ${labType}, ${validTestIds.length} tests`);

        // Strategy: Delete all records that could conflict, then create new ones
        // The unique constraint is on [technicianId, testCatalogId], so we need to
        // delete any existing records with those combinations before creating new ones

        // Step 1: Delete all selections for this technician and lab type
        // This clears everything for the specific lab type
        const deleteByLabType = await tx.technicianTestSelection.deleteMany({
          where: {
            technicianId,
            labType: labType,
          },
        });
        console.log(`[Transaction] Deleted ${deleteByLabType.count} selections for lab type ${labType}`);

        // Step 2: For each test we're about to add, ensure no conflicting records exist
        // Delete any records with the same technicianId + testCatalogId from other lab types
        // This is necessary because the unique constraint is [technicianId, testCatalogId]
        if (validTestIds.length > 0) {
          // Delete duplicates from other lab types (if any exist)
          // Note: We do this individually to handle the unique constraint properly
          for (const testCatalogId of validTestIds) {
            try {
              const deleteResult = await tx.technicianTestSelection.deleteMany({
                where: {
                  technicianId,
                  testCatalogId,
                  // Note: We already deleted this labType in Step 1,
                  // so this will only delete from other lab types
                },
              });
              if (deleteResult.count > 0) {
                console.log(`[Transaction] Deleted ${deleteResult.count} duplicate(s) for test ${testCatalogId} from other lab types`);
              }
            } catch (deleteError: any) {
              console.error(`[Transaction] Error deleting duplicates for test ${testCatalogId}:`, deleteError);
              // Don't throw - this is just cleanup, and the record might not exist
            }
          }
        }

        // Step 3: Create new selections for this lab type
        if (validTestIds.length > 0) {
          console.log(`[Transaction] Creating ${validTestIds.length} new selections...`);
          
          // Create records one by one to catch any individual failures
          const selections = [];
          for (const testCatalogId of validTestIds) {
            try {
              const selection = await tx.technicianTestSelection.create({
                data: {
                  technicianId,
                  testCatalogId,
                  labType,
                },
              });
              selections.push(selection);
            } catch (createError: any) {
              console.error(`[Transaction] Failed to create selection for test ${testCatalogId}:`, createError);
              console.error(`[Transaction] Error code: ${createError?.code}`);
              console.error(`[Transaction] Error meta:`, JSON.stringify(createError?.meta, null, 2));
              // Throw the error to rollback the transaction
              throw createError;
            }
          }

          console.log(`[Transaction] Successfully created ${selections.length} selections for lab type ${labType}`);
          return selections;
        }

        console.log(`[Transaction] No tests to create, returning empty array`);
        return [];
      }, {
        maxWait: 5000,
        timeout: 20000, // Increased timeout for large batches
      });
      console.log('[Transaction] Transaction completed successfully');
    } catch (txError: any) {
      console.error('[Transaction] Transaction failed:', txError);
      console.error('[Transaction] Error type:', typeof txError);
      console.error('[Transaction] Error code:', txError?.code);
      console.error('[Transaction] Error meta:', JSON.stringify(txError?.meta, null, 2));
      console.error('[Transaction] Error message:', txError?.message);
      if (txError?.stack) {
        console.error('[Transaction] Error stack:', txError.stack);
      }
      // Re-throw to be caught by outer catch block
      throw txError;
    }

    // Log the action (non-blocking)
    await logAudit({
      userId: req.user!.id,
      action: 'SET_TECHNICIAN_TEST_SELECTIONS',
      tableName: 'technician_test_selections',
      recordId: technicianId,
      newValue: { technicianId, testCatalogIds: validTestIds, labType },
    }).catch(err => {
      console.error('Failed to create audit log:', err);
      // Don't fail the request if audit log fails
    });

    res.json({
      success: true,
      message: 'Technician test selections updated successfully',
      data: { selections: result },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    // Handle Prisma errors specifically
    if (error && typeof error === 'object' && 'code' in error) {
      console.error('Prisma error:', error);
      if (error.code === 'P2002') {
        return res.status(400).json({
          success: false,
          message: 'Duplicate selection detected. Please try again.',
        });
      }
    }
    
    console.error('Set technician test selections error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      meta: (error as any)?.meta,
    });
    
    // Return detailed error in development, generic in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ...(isDevelopment && {
        errorCode: (error as any)?.code,
        errorMeta: (error as any)?.meta,
        errorStack: error instanceof Error ? error.stack : undefined,
      }),
    });
  }
};

// Get tests available for a specific technician (based on their selections)
export const getTechnicianAvailableTests = async (req: AuthRequest, res: Response) => {
  try {
    const { technicianId } = req.params;

    const selections = await prisma.technicianTestSelection.findMany({
      where: {
        technicianId,
        isActive: true,
      },
      include: {
        testCatalog: true,
      },
    });

    const availableTests = selections.map(selection => selection.testCatalog);

    res.json({
      success: true,
      data: { availableTests },
    });
  } catch (error) {
    console.error('Get technician available tests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get lab test categories for filtering
export const getLabTestCategories = async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.testCatalog.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    const categoryList = categories
      .map(c => c.category)
      .filter(category => category !== null);

    res.json({
      success: true,
      data: { categories: categoryList },
    });
  } catch (error) {
    console.error('Get lab test categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Upload lab test report file
export const uploadLabTestReport = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Check if lab test exists
    const existingLabTest = await prisma.labTest.findUnique({
      where: { id },
      include: { testCatalog: true },
    });

    if (!existingLabTest) {
      return res.status(404).json({
        success: false,
        message: 'Lab test not found',
      });
    }

    // Verify test category requires report upload (MRI, CT Scan, X-Ray)
    const testCategory = existingLabTest.testCatalog?.category;
    const requiresReport = testCategory === 'MRI' || testCategory === 'CT Scan' || testCategory === 'X-Ray';
    
    if (!requiresReport) {
      return res.status(400).json({
        success: false,
        message: 'Report file upload is only required for MRI, CT Scan, and X-Ray tests',
      });
    }

    const filePath = req.file.path;

    // Update lab test with report file path
    const updatedLabTest = await prisma.labTest.update({
      where: { id },
      data: {
        reportFile: filePath,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        orderedByUser: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        testCatalog: {
          select: {
            id: true,
            testName: true,
            description: true,
            price: true,
          },
        },
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPLOAD_LAB_TEST_REPORT',
      tableName: 'lab_tests',
      recordId: id,
      oldValue: { reportFile: existingLabTest.reportFile },
      newValue: { reportFile: filePath },
    });

    res.json({
      success: true,
      message: 'Report file uploaded successfully',
      data: { labTest: updatedLabTest },
    });
  } catch (error) {
    console.error('Upload lab test report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading report file',
    });
  }
};
