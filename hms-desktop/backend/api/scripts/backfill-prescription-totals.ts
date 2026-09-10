/**
 * Recalculate prescription.totalAmount from prescription line items:
 * sum(medicine_catalog.price * physical dispense units) per item.
 *
 * Use after fixing stats revenue, or when older rows have total_amount = 0.
 *
 * Run from backend folder:
 *   npx ts-node api/scripts/backfill-prescription-totals.ts
 *
 * Options:
 *   --dry-run     Log changes only, do not write
 *   --dispensed-only   Only prescriptions with status DISPENSED
 *
 * Note: Uses current medicine catalog prices, not historical prices at issue time.
 */
import { PrismaClient, PrescriptionStatus } from '@prisma/client';
import { computeUnitsToDispenseForLine } from '../utils/prescriptionDispenseUnits';

const prisma = new PrismaClient();

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dispensedOnly = args.includes('--dispensed-only');

  const where = dispensedOnly ? { status: PrescriptionStatus.DISPENSED } : {};

  const prescriptions = await prisma.prescription.findMany({
    where,
    include: {
      prescriptionItems: {
        include: {
          medicine: { select: { id: true, name: true, price: true } },
        },
        orderBy: { rowOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  let unchanged = 0;
  let missingMedicine = 0;

  for (const p of prescriptions) {
    let total = 0;
    for (const item of p.prescriptionItems) {
      if (!item.medicine) {
        missingMedicine++;
        continue;
      }
      total += Number(item.medicine.price) * computeUnitsToDispenseForLine(item);
    }
    total = roundMoney(total);

    const current = roundMoney(Number(p.totalAmount));
    if (Math.abs(current - total) < 0.005) {
      unchanged++;
      continue;
    }

    console.log(
      `[${p.status}] ${p.prescriptionNumber} (${p.id.slice(0, 8)}…): total ${current} → ${total}`
    );

    if (!dryRun) {
      await prisma.prescription.update({
        where: { id: p.id },
        data: { totalAmount: total },
      });
    }
    updated++;
  }

  console.log(
    `\nDone${dryRun ? ' (dry-run)' : ''}. Updated: ${updated}, unchanged: ${unchanged}, prescriptions scanned: ${prescriptions.length}.` +
      (missingMedicine ? ` Line items with missing medicine: ${missingMedicine}.` : '')
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
