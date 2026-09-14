import { Response } from 'express';
import { PrismaClient, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

const plQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

function parseLocalDayStart(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function parseLocalDayEnd(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function toDateRange(from?: string, to?: string) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const start = from ? parseLocalDayStart(from) : defaultFrom;
  const end = to ? parseLocalDayEnd(to) : defaultTo;
  return { start, end };
}

export const getProfitLoss = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = plQuerySchema.parse(req.query);
    const { start, end } = toDateRange(from, to);

    const [opdRevenueAgg, ipdRevenueAgg, expensesAgg] = await Promise.all([
      prisma.bill.aggregate({
        where: { paymentStatus: { in: ['PAID', 'PARTIAL'] }, createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      prisma.inpatientBill.aggregate({
        where: { status: 'PAID', createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      prisma.expense.aggregate({
        where: { paymentStatus: PaymentStatus.PAID, expenseDate: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
    ]);

    // Medicine purchases expense (paid)
    // Use paymentDate when available; otherwise fall back to orderDate for PAID orders missing paymentDate.
    const [medicinePaidWithDateAgg, medicinePaidWithoutDateAgg] = await Promise.all([
      prisma.medicineOrder.aggregate({
        where: {
          paymentStatus: PaymentStatus.PAID,
          paymentDate: { not: null, gte: start, lte: end },
        },
        _sum: { totalAmount: true },
      }),
      prisma.medicineOrder.aggregate({
        where: {
          paymentStatus: PaymentStatus.PAID,
          paymentDate: null,
          orderDate: { gte: start, lte: end },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const opdRevenue = Number(opdRevenueAgg._sum.totalAmount || 0);
    const ipdRevenue = Number(ipdRevenueAgg._sum.totalAmount || 0);
    const totalRevenue = opdRevenue + ipdRevenue;

    const manualExpenses = Number(expensesAgg._sum.amount || 0);
    const medicinePurchases =
      Number(medicinePaidWithDateAgg._sum.totalAmount || 0) + Number(medicinePaidWithoutDateAgg._sum.totalAmount || 0);

    const totalExpenses = manualExpenses + medicinePurchases;
    const profitOrLoss = totalRevenue - totalExpenses;

    res.json({
      success: true,
      data: {
        range: { from: start.toISOString(), to: end.toISOString() },
        revenue: {
          opd: opdRevenue,
          ipd: ipdRevenue,
          total: totalRevenue,
        },
        expenses: {
          manual: manualExpenses, // salaries + misc stored in expenses table
          medicinePurchases,
          total: totalExpenses,
        },
        profitOrLoss,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.issues });
    }
    console.error('Get profit/loss error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

