import { computeUnitsToDispenseForLine } from './prescriptionDispenseUnits';

export type PrescriptionStockLine = {
  medicineId: string;
  quantity: number;
  frequency: string;
  duration: number;
};

export type MedicineStockSnapshot = {
  id: string;
  name: string;
  stockQuantity: number;
  price: unknown;
};

export type DispensePlan = {
  lineDispense: Array<{ medicineId: string; units: number }>;
  requiredByMedicine: Map<string, number>;
  shortages: string[];
  missingMedicineIds: string[];
  totalAmount: number;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/**
 * Build a dispense plan from the prescription and a fresh catalog snapshot.
 *
 * Requirements are aggregated by medicine, so repeated lines cannot each appear
 * available while their combined quantity exceeds current stock.
 */
export function buildDispensePlan(
  lines: PrescriptionStockLine[],
  catalogRows: MedicineStockSnapshot[],
): DispensePlan {
  const lineDispense = lines.map((line) => ({
    medicineId: line.medicineId,
    units: computeUnitsToDispenseForLine(line),
  }));

  const requiredByMedicine = new Map<string, number>();
  for (const line of lineDispense) {
    requiredByMedicine.set(
      line.medicineId,
      (requiredByMedicine.get(line.medicineId) || 0) + line.units,
    );
  }

  const catalogById = new Map(catalogRows.map((medicine) => [medicine.id, medicine]));
  const missingMedicineIds = [...requiredByMedicine.keys()].filter(
    (medicineId) => !catalogById.has(medicineId),
  );

  const shortages: string[] = [];
  for (const [medicineId, requiredUnits] of requiredByMedicine) {
    const medicine = catalogById.get(medicineId);
    if (medicine && medicine.stockQuantity < requiredUnits) {
      shortages.push(
        `${medicine.name}: need ${requiredUnits} units, in stock ${medicine.stockQuantity}`,
      );
    }
  }

  const totalAmount = roundMoney(
    lineDispense.reduce(
      (total, line) =>
        total + Number(catalogById.get(line.medicineId)?.price ?? 0) * line.units,
      0,
    ),
  );

  return {
    lineDispense,
    requiredByMedicine,
    shortages,
    missingMedicineIds,
    totalAmount,
  };
}
