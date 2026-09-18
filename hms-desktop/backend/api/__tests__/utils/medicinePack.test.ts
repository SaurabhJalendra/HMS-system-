import {
  formatPackStock,
  resolveTabletQuantity,
  tabletsFromStrips,
} from '../../utils/medicinePack';

describe('medicinePack', () => {
  it('formats strips and tablets as 12-10', () => {
    expect(formatPackStock(120, 10)).toBe('12-10');
    expect(formatPackStock(125, 10)).toBe('12-10 (+5)');
    expect(formatPackStock(8, null)).toBe('8');
  });

  it('computes tablet stock from strips', () => {
    expect(tabletsFromStrips(12, 10)).toBe(120);
    expect(resolveTabletQuantity({ strips: 12, tabletsPerStrip: 10 })).toEqual({
      quantity: 120,
      tabletsPerStrip: 10,
    });
  });
});
