import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { FileParserService } from '../../services/fileParserService';

describe('FileParserService Excel imports', () => {
  const files: string[] = [];

  afterEach(() => {
    for (const file of files.splice(0)) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  function writeWorkbook(rows: Record<string, unknown>[]): string {
    const file = path.join(os.tmpdir(), `medicine-import-${Date.now()}-${Math.random()}.xlsx`);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Medicines');
    XLSX.writeFile(workbook, file);
    files.push(file);
    return file;
  }

  it('maps the 3 pack columns by header regardless of column order', async () => {
    const file = writeWorkbook([{
      'Tablets per strip': 10,
      'Strips': 12,
      'Item Name': 'ExampleMed',
    }]);

    const medicines = await FileParserService.parseExcel(file);

    expect(medicines).toHaveLength(1);
    expect(medicines[0]).toMatchObject({
      name: 'ExampleMed',
      category: 'General',
      price: 0,
      stockQuantity: 120,
      tabletsPerStrip: 10,
      strips: 12,
      lowStockThreshold: 10,
    });
  });

  it('still accepts a legacy Current Quantity file', async () => {
    const file = writeWorkbook([{
      'Current Quantity': 25,
      'Item Name': 'ExampleMed',
    }]);

    const medicines = await FileParserService.parseExcel(file);
    expect(medicines[0]).toMatchObject({
      name: 'ExampleMed',
      stockQuantity: 25,
    });
  });

  it('rejects a workbook that is missing a required column', async () => {
    const file = writeWorkbook([{
      'Item Name': 'ExampleMed',
    }]);

    await expect(FileParserService.parseExcel(file)).rejects.toThrow(
      'Missing required column(s): Strips',
    );
  });

  it('accepts zero strips', async () => {
    const validFile = writeWorkbook([{
      'Item Name': 'Out of stock medicine',
      'Strips': 0,
      'Tablets per strip': 10,
    }]);
    await expect(FileParserService.parseExcel(validFile)).resolves.toMatchObject([
      { name: 'Out of stock medicine', stockQuantity: 0, tabletsPerStrip: 10 },
    ]);
  });
});
