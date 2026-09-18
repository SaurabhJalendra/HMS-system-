import { Response } from 'express';
import { PrismaClient, ExpenseCategory, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../utils/auditLogger';
import { parseLocalDateInput, parseLocalDayEnd, parseLocalDayStart } from '../utils/financeCash';

const prisma = new PrismaClient();

const expenseCreateSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().min(1).max(500),
  amount: z.coerce.number().positive(),
  expenseDate: z.string().optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  paidAt: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
});

const expenseUpdateSchema = expenseCreateSchema.partial();

const expenseSearchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  userId: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
});

const salaryBulkUpsertSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
  items: z.array(
    z.object({
      userId: z.string().min(1),
      amount: z.coerce.number().min(0),
      paymentStatus: z.nativeEnum(PaymentStatus).optional(),
    })
  ),
});

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0);
  return { start, end };
}

export const createExpense = async (req: AuthRequest, res: Response) => {
  try {
    const data = expenseCreateSchema.parse(req.body);

    const expense = await prisma.expense.create({
      data: {
        category: data.category,
        description: data.description,
        amount: data.amount,
        expenseDate: data.expenseDate ? parseLocalDateInput(data.expenseDate) : new Date(),
        paymentStatus: data.paymentStatus ?? PaymentStatus.PENDING,
        paidAt: data.paidAt ? new Date(data.paidAt) : (data.paymentStatus === PaymentStatus.PAID ? new Date() : null),
        userId: data.userId || null,
        createdBy: req.user!.id,
      },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
        createdByUser: { select: { id: true, fullName: true, role: true } },
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_EXPENSE',
      tableName: 'expenses',
      recordId: expense.id,
      newValue: {
        category: expense.category,
        amount: expense.amount,
        expenseDate: expense.expenseDate,
        paymentStatus: expense.paymentStatus,
        userId: expense.userId,
      },
    });

    res.status(201).json({ success: true, data: { expense } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.issues });
    }
    console.error('Create expense error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, category, paymentStatus, userId, page, limit } = expenseSearchSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category) where.category = category;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (userId) where.userId = userId;
    if (from || to) {
      where.expenseDate = {};
      if (from) where.expenseDate.gte = parseLocalDayStart(from);
      if (to) where.expenseDate.lte = parseLocalDayEnd(to);
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expenseDate: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, role: true } },
          createdByUser: { select: { id: true, fullName: true, role: true } },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.issues });
    }
    console.error('Get expenses error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = expenseUpdateSchema.parse(req.body);

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(data.category ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description as any } : {}),
        ...(data.amount !== undefined ? { amount: data.amount as any } : {}),
        ...(data.expenseDate ? { expenseDate: parseLocalDateInput(data.expenseDate) } : {}),
        ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
        ...(data.paidAt !== undefined ? { paidAt: data.paidAt ? new Date(data.paidAt) : null } : {}),
        ...(data.userId !== undefined ? { userId: data.userId || null } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
        createdByUser: { select: { id: true, fullName: true, role: true } },
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_EXPENSE',
      tableName: 'expenses',
      recordId: expense.id,
      oldValue: existing,
      newValue: expense,
    });

    res.json({ success: true, data: { expense } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.issues });
    }
    console.error('Update expense error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    await prisma.expense.delete({ where: { id } });

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_EXPENSE',
      tableName: 'expenses',
      recordId: id,
      oldValue: existing,
    });

    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Admin-only helper endpoint: set salaries for all active users for a month.
// It will update existing salary expense rows in that month range, or create them if missing.
export const upsertMonthlySalaries = async (req: AuthRequest, res: Response) => {
  try {
    const { month, items } = salaryBulkUpsertSchema.parse(req.body);
    const { start, end } = monthRange(month);

    const expenses = await prisma.$transaction(async (tx) => {
      const out: any[] = [];
      for (const it of items) {
        if (Number(it.amount) <= 0 && !it.paymentStatus) {
          continue;
        }
        const existing = await tx.expense.findFirst({
          where: {
            category: ExpenseCategory.SALARY,
            userId: it.userId,
            expenseDate: { gte: start, lt: end },
          },
          orderBy: { expenseDate: 'desc' },
        });

        if (existing) {
          out.push(
            await tx.expense.update({
              where: { id: existing.id },
              data: {
                amount: it.amount,
                description: `Salary for ${month}`,
                paymentStatus: it.paymentStatus ?? existing.paymentStatus ?? PaymentStatus.PENDING,
                expenseDate: start,
                paidAt: (it.paymentStatus ?? existing.paymentStatus) === PaymentStatus.PAID ? new Date() : existing.paidAt,
              },
              include: {
                user: { select: { id: true, fullName: true, role: true } },
              },
            })
          );
        } else if (Number(it.amount) > 0) {
          out.push(
            await tx.expense.create({
              data: {
                category: ExpenseCategory.SALARY,
                userId: it.userId,
                description: `Salary for ${month}`,
                amount: it.amount,
                expenseDate: start,
                paymentStatus: it.paymentStatus ?? PaymentStatus.PENDING,
                paidAt: (it.paymentStatus ?? PaymentStatus.PENDING) === PaymentStatus.PAID ? new Date() : null,
                createdBy: req.user!.id,
              },
              include: {
                user: { select: { id: true, fullName: true, role: true } },
              },
            })
          );
        }
      }
      return out;
    });

    // Audit (summary)
    await logAudit({
      userId: req.user!.id,
      action: 'UPSERT_MONTHLY_SALARIES',
      tableName: 'expenses',
      recordId: month,
      newValue: { month, count: expenses.length },
    });

    res.json({ success: true, data: { expenses } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.issues });
    }
    console.error('Upsert monthly salaries error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

