import { formatPackStock, tabletsFromStrips } from '../../lib/utils/medicinePack';

describe('medicinePack display', () => {
  it('shows 12-10 for 12 strips of 10 tablets', () => {
    expect(tabletsFromStrips(12, 10)).toBe(120);
    expect(formatPackStock(120, 10)).toBe('12-10');
  });
});
