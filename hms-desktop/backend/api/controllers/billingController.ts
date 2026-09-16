import { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../utils/auditLogger';

const prisma = new PrismaClient();

// Item schema for section-wise billing
const billItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  amount: z.number().min(0),
  medicineId: z.string().optional(),
  testId: z.string().optional(),
});

// Validation schemas
const createBillSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  items: z.object({
    consultation: z.object({
      items: z.array(billItemSchema).optional().default([]),
      subtotal: z.number().optional().default(0),
    }).optional().default({ items: [], subtotal: 0 }),
    pharmacy: z.object({
      items: z.array(billItemSchema).optional().default([]),
      subtotal: z.number().optional().default(0),
    }).optional().default({ items: [], subtotal: 0 }),
    labTests: z.object({
      items: z.array(billItemSchema).optional().default([]),
      subtotal: z.number().optional().default(0),
    }).optional().default({ items: [], subtotal: 0 }),
    other: z.object({
      items: z.array(billItemSchema).optional().default([]),
      subtotal: z.number().optional().default(0),
    }).optional().default({ items: [], subtotal: 0 }),
  }),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'NET_BANKING', 'INSURANCE']).optional().default('CASH'),
  paymentStatus: z.enum(['PENDING', 'PAID', 'PARTIAL', 'CANCELLED']).optional().default('PAID'),
  discountPct: z.number().min(0).max(100).optional().default(0),
  taxPct: z.number().min(0).optional().default(0),
});

const updateBillSchema = z.object({
  paymentStatus: z.enum(['PENDING', 'PAID', 'PARTIAL', 'CANCELLED']).optional(),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'NET_BANKING', 'INSURANCE']).optional(),
});

const billSearchSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['PENDING', 'PAID', 'PARTIAL', 'CANCELLED']).optional(),
  patientId: z.string().min(1).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
});

// Helper function to generate invoice number and increment counter
const generateInvoiceNumber = async (): Promise<string> => {
  // Get hospital config
  const hospitalConfig = await prisma.hospitalConfig.findFirst();
  
  // Get billing settings
  const billingSettings = (hospitalConfig?.modulesEnabled as any)?.billingSettings || {};
  const invoicePrefix = billingSettings.invoicePrefix || 'INV-';
  const nextInvoiceNumber = billingSettings.nextInvoiceNumber || 1;
  
  // Generate invoice number
  const invoiceNumber = `${invoicePrefix}${nextInvoiceNumber}`;
  
  // Increment next invoice number in config
  const updatedBillingSettings = {
    ...billingSettings,
    nextInvoiceNumber: nextInvoiceNumber + 1,
  };
  
  // Update hospital config
  if (hospitalConfig) {
    const modulesEnabled = (hospitalConfig.modulesEnabled as any) || {};
    await prisma.hospitalConfig.update({
      where: { id: hospitalConfig.id },
      data: {
        modulesEnabled: {
          ...modulesEnabled,
          billingSettings: updatedBillingSettings,
        },
      },
    });
  }
  
  return invoiceNumber;
};

// Create a new bill
export const createBill = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = createBillSchema.parse(req.body);
    const userId = req.user!.id;

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

    // Recompute every subtotal here rather than trusting the client. Sections are
    // rebuilt into a new object because the schema's `.default()` section objects
    // are shared across requests — mutating them in place leaks totals between bills.
    const sumAmounts = (items: { amount: number }[]) =>
      items.reduce((total, item) => total + item.amount, 0);

    const sections = {
      consultation: {
        items: validatedData.items.consultation.items,
        subtotal: sumAmounts(validatedData.items.consultation.items),
      },
      pharmacy: {
        items: validatedData.items.pharmacy.items,
        subtotal: sumAmounts(validatedData.items.pharmacy.items),
      },
      labTests: {
        items: validatedData.items.labTests.items,
        subtotal: sumAmounts(validatedData.items.labTests.items),
      },
      other: {
        items: validatedData.items.other.items,
        subtotal: sumAmounts(validatedData.items.other.items),
      },
    };

    // Calculate total
    const subtotal = 
      sections.consultation.subtotal +
      sections.pharmacy.subtotal +
      sections.labTests.subtotal +
      sections.other.subtotal;

    const discountPct = validatedData.discountPct || 0;
    const taxPct = validatedData.taxPct || 0;
    const discountAmount = subtotal * (discountPct / 100);
    const afterDiscount = subtotal - discountAmount;
    const tax = afterDiscount * (taxPct / 100);
    const totalAmount = afterDiscount + tax;

    // Generate invoice number using prefix and next invoice number
    const invoiceNumber = await generateInvoiceNumber();

    // Create bill
    const bill = await prisma.bill.create({
      data: {
        patientId: validatedData.patientId,
        receptionistId: userId,
        invoiceNumber,
        items: {
          ...sections,
          discountPct,
          taxPct,
          discountAmount,
        } as any,
        subtotal,
        tax,
        totalAmount,
        paymentMode: validatedData.paymentMode,
        paymentStatus: validatedData.paymentStatus || 'PAID',
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        receptionist: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Create audit log
    await createAuditLog({
      userId,
      action: 'CREATE_BILL',
      entityType: 'Bill',
      entityId: bill.id,
      details: {
        patientId: bill.patientId,
        totalAmount: bill.totalAmount,
        paymentStatus: bill.paymentStatus,
      },
    });

    res.status(201).json({
      success: true,
      data: bill,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }

    // A bare "Internal server error" previously hid schema drift here (bills
    // lacked the invoice_number column), so name the database fault instead.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Create bill error (Prisma ${error.code}):`, error.message);
      return res.status(500).json({
        success: false,
        message:
          `Could not save the bill (database error ${error.code}). ` +
          'If this persists, apply pending database migrations and retry.',
      });
    }

    console.error('Create bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all bills with filtering and pagination
export const getBills = async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, patientId, dateFrom, dateTo, page, limit } = billSearchSchema.parse(req.query);
    
    const skip = (page - 1) * limit;
    
    const where: any = {};
    
    if (search) {
      where.OR = [
        { patient: { name: { contains: search, mode: 'insensitive' } } },
        { patient: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }
    
    if (status) {
      where.paymentStatus = status;
    }
    
    if (patientId) {
      where.patientId = patientId;
    }
    
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
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
              address: true,
            },
          },
          receptionist: {
            select: {
              fullName: true,
            },
          },
        },
      }),
      prisma.bill.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        bills,
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
    console.error('Get bills error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get bill by ID
export const getBillById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        receptionist: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found',
      });
    }

    res.json({
      success: true,
      data: bill,
    });
  } catch (error) {
    console.error('Get bill by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update bill
export const updateBill = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateBillSchema.parse(req.body);
    const userId = req.user!.id;

    const existingBill = await prisma.bill.findUnique({
      where: { id },
    });

    if (!existingBill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found',
      });
    }

    const bill = await prisma.bill.update({
      where: { id },
      data: {
        ...validatedData,
        updatedAt: new Date(),
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        receptionist: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Create audit log
    await createAuditLog({
      userId,
      action: 'UPDATE_BILL',
      entityType: 'Bill',
      entityId: bill.id,
      details: {
        changes: validatedData,
        newPaymentStatus: bill.paymentStatus,
      },
    });

    res.json({
      success: true,
      data: bill,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    console.error('Update bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete bill
export const deleteBill = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const existingBill = await prisma.bill.findUnique({
      where: { id },
    });

    if (!existingBill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found',
      });
    }

    // Only allow deletion of pending bills
    if (existingBill.paymentStatus !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Only pending bills can be deleted',
      });
    }

    await prisma.bill.delete({
      where: { id },
    });

    // Create audit log (with error handling to prevent deletion failure)
    try {
      await createAuditLog({
        userId,
        action: 'DELETE_BILL',
        entityType: 'Bill',
        entityId: id,
        details: {
          patientId: existingBill.patientId,
          totalAmount: existingBill.totalAmount,
        },
      });
    } catch (auditError) {
      console.warn('Failed to create audit log for bill deletion:', auditError);
      // Don't fail the deletion if audit log creation fails
    }

    res.json({
      success: true,
      message: 'Bill deleted successfully',
    });
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get billing statistics
export const getBillingStats = async (req: AuthRequest, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalBills,
      pendingBills,
      paidBills,
      totalRevenue,
      monthlyRevenue,
      averageBillAmount,
    ] = await Promise.all([
      prisma.bill.count(),
      prisma.bill.count({ where: { paymentStatus: 'PENDING' } }),
      prisma.bill.count({ where: { paymentStatus: 'PAID' } }),
      prisma.bill.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { totalAmount: true },
      }),
      prisma.bill.aggregate({
        where: {
          paymentStatus: 'PAID',
          createdAt: { gte: startDate },
        },
        _sum: { totalAmount: true },
      }),
      prisma.bill.aggregate({
        where: { paymentStatus: 'PAID' },
        _avg: { totalAmount: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalBills,
        pendingBills,
        paidBills,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
        monthlyRevenue: monthlyRevenue._sum.totalAmount || 0,
        averageBillAmount: averageBillAmount._avg.totalAmount || 0,
      },
    });
  } catch (error) {
    console.error('Get billing stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Generate invoice data
export const generateInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        receptionist: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found',
      });
    }

    // Format invoice data
    const invoiceData = {
      billNumber: bill.invoiceNumber || bill.id, // Use invoiceNumber if available, fallback to id
      billDate: bill.createdAt,
      patient: bill.patient,
      items: bill.items,
      subtotal: bill.subtotal,
      tax: bill.tax,
      totalAmount: bill.totalAmount,
      paymentStatus: bill.paymentStatus,
      paymentMode: bill.paymentMode,
      receptionist: bill.receptionist,
    };

    res.json({
      success: true,
      data: invoiceData,
      message: 'Invoice data ready for PDF generation',
    });
  } catch (error) {
    console.error('Generate invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};