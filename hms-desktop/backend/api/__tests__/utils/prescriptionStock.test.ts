import { buildDispensePlan } from '../../utils/prescriptionStock';

const line = {
  medicineId: 'medicine-1',
  quantity: 1,
  frequency: '1-0-1',
  duration: 5,
};

describe('prescription current-stock dispense plan', () => {
  it('allows dispensing when stock added after creation is now sufficient', () => {
    const plan = buildDispensePlan(
      [line],
      [
        {
          id: 'medicine-1',
          name: 'Example tablet',
          stockQuantity: 10,
          price: 5,
        },
      ],
    );

    expect(plan.requiredByMedicine.get('medicine-1')).toBe(10);
    expect(plan.shortages).toEqual([]);
    expect(plan.totalAmount).toBe(50);
  });

  it('reports the exact shortage from the current stock snapshot', () => {
    const plan = buildDispensePlan(
      [line],
      [
        {
          id: 'medicine-1',
          name: 'Example tablet',
          stockQuantity: 7,
          price: 5,
        },
      ],
    );

    expect(plan.shortages).toEqual([
      'Example tablet: need 10 units, in stock 7',
    ]);
  });

  it('aggregates repeated prescription lines for the same medicine', () => {
    const plan = buildDispensePlan(
      [line, { ...line, duration: 2 }],
      [
        {
          id: 'medicine-1',
          name: 'Example tablet',
          stockQuantity: 12,
          price: 5,
        },
      ],
    );

    expect(plan.requiredByMedicine.get('medicine-1')).toBe(14);
    expect(plan.shortages).toEqual([
      'Example tablet: need 14 units, in stock 12',
    ]);
  });
});
