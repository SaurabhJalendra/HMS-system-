export function formatPackStock(stockQuantity: number, tabletsPerStrip?: number | null): string {
  if (!tabletsPerStrip || tabletsPerStrip < 1) {
    return String(stockQuantity ?? 0);
  }
  const strips = Math.floor(Math.max(0, stockQuantity) / tabletsPerStrip);
  const remainder = Math.max(0, stockQuantity) % tabletsPerStrip;
  return remainder === 0
    ? `${strips}-${tabletsPerStrip}`
    : `${strips}-${tabletsPerStrip} (+${remainder})`;
}

export function tabletsFromStrips(strips: number, tabletsPerStrip: number): number {
  return Math.max(0, Math.floor(strips)) * Math.max(1, Math.floor(tabletsPerStrip));
}

export function stockQuantityOf(medicine: {
  stockQuantity?: number;
  quantity?: number;
} | null | undefined): number {
  return medicine?.stockQuantity ?? medicine?.quantity ?? 0;
}

export function packDisplayOf(medicine: {
  packDisplay?: string;
  stockQuantity?: number;
  quantity?: number;
  tabletsPerStrip?: number | null;
} | null | undefined): string {
  if (medicine?.packDisplay) return medicine.packDisplay;
  return formatPackStock(stockQuantityOf(medicine), medicine?.tabletsPerStrip);
}
