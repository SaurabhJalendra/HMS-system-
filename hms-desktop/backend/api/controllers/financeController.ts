import { Response } from 'express';
import { PrismaClient, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import {
  cashEventDate,
  cashReceivedForInvoice,
  isDateInsideRange,
  parseLocalDayEnd,
  parseLocalDayStart,
} from '../utils/financeCash';

const prisma = new PrismaClient();

const plQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

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

    const [opdBills, ipdBills, expensesAgg] = await Promise.all([
      prisma.bill.findMany({
        where: { paymentStatus: { in: ['PAID', 'PARTIAL'] } },
      }),
      prisma.inpatientBill.findMany({
        where: { status: { in: ['PAID', 'PARTIAL'] } },
        select: {
          totalAmount: true,
          status: true,
          paidAmount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.expense.aggregate({
        where: { paymentStatus: PaymentStatus.PAID, expenseDate: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
    ]);

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

    const opdRevenue = opdBills.reduce((sum, bill: any) => {
      const eventDate = cashEventDate(bill.paidAt, bill.createdAt);
      if (!isDateInsideRange(eventDate, start, end)) return sum;
      return sum + cashReceivedForInvoice(bill.paymentStatus, Number(bill.totalAmount), bill.paidAmount);
    }, 0);

    const ipdRevenue = ipdBills.reduce((sum, bill) => {
      const eventDate = cashEventDate(bill.updatedAt, bill.createdAt);
      if (!isDateInsideRange(eventDate, start, end)) return sum;
      return sum + cashReceivedForInvoice(bill.status, Number(bill.totalAmount), bill.paidAmount);
    }, 0);

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
          manual: manualExpenses,
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
    console.error('Get profit/loss error', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
