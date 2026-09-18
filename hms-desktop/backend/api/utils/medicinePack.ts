export function parseWholeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function tabletsFromStrips(strips: number, tabletsPerStrip: number): number {
  return Math.max(0, Math.floor(strips)) * Math.max(1, Math.floor(tabletsPerStrip));
}

export function stripsFromStock(stockQuantity: number, tabletsPerStrip?: number | null): number | null {
  if (!tabletsPerStrip || tabletsPerStrip < 1) return null;
  return Math.floor(Math.max(0, stockQuantity) / tabletsPerStrip);
}

export function formatPackStock(stockQuantity: number, tabletsPerStrip?: number | null): string {
  if (!tabletsPerStrip || tabletsPerStrip < 1) {
    return String(stockQuantity ?? 0);
  }
  const strips = stripsFromStock(stockQuantity, tabletsPerStrip) ?? 0;
  const remainder = Math.max(0, stockQuantity) % tabletsPerStrip;
  return remainder === 0
    ? `${strips}-${tabletsPerStrip}`
    : `${strips}-${tabletsPerStrip} (+${remainder})`;
}

export function resolveTabletQuantity(input: {
  quantity?: unknown;
  strips?: unknown;
  tabletsPerStrip?: unknown;
  existingTabletsPerStrip?: number | null;
}): { quantity: number; tabletsPerStrip: number | null } {
  const tabletsPerStrip =
    parseWholeNumber(input.tabletsPerStrip) ??
    (input.existingTabletsPerStrip && input.existingTabletsPerStrip > 0
      ? input.existingTabletsPerStrip
      : null);
  const strips = parseWholeNumber(input.strips);
  if (strips !== null) {
    if (!tabletsPerStrip || tabletsPerStrip < 1) {
      throw new Error('Tablets per strip is required when entering strips');
    }
    return {
      quantity: tabletsFromStrips(strips, tabletsPerStrip),
      tabletsPerStrip,
    };
  }

  const quantity = parseWholeNumber(input.quantity);
  if (quantity === null) {
    throw new Error('Enter strips and tablets per strip, or a tablet quantity');
  }
  return { quantity, tabletsPerStrip };
}

export function decorateMedicinePack<T extends { stockQuantity: number; tabletsPerStrip?: number | null }>(
  medicine: T,
) {
  const tabletsPerStrip = medicine.tabletsPerStrip ?? null;
  return {
    ...medicine,
    tabletsPerStrip,
    strips: stripsFromStock(medicine.stockQuantity, tabletsPerStrip),
    packDisplay: formatPackStock(medicine.stockQuantity, tabletsPerStrip),
    totalTablets: medicine.stockQuantity,
  };
}
