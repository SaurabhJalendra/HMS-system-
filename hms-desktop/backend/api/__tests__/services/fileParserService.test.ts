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

  it('maps required columns by header regardless of column order', async () => {
    const file = writeWorkbook([{
      'Batch Number': 'BATCH-100',
      'Current Quantity': 25,
      'Item Name': 'ExampleMed',
    }]);

    const medicines = await FileParserService.parseExcel(file);

    expect(medicines).toHaveLength(1);
    expect(medicines[0]).toMatchObject({
      name: 'ExampleMed',
      batchNumber: 'BATCH-100',
      category: 'General',
      price: 0,
      stockQuantity: 25,
      lowStockThreshold: 10,
    });
  });

  it('rejects a workbook that is missing a required column', async () => {
    const file = writeWorkbook([{
      'Item Name': 'ExampleMed',
      'Current Quantity': 25,
    }]);

    await expect(FileParserService.parseExcel(file)).rejects.toThrow(
      'Missing required column(s): Batch Number',
    );
  });

  it('accepts zero current quantity but rejects an empty required cell', async () => {
    const validFile = writeWorkbook([{
      'Item Name': 'Out of stock medicine',
      'Current Quantity': 0,
      'Batch Number': 'ZERO-1',
    }]);
    await expect(FileParserService.parseExcel(validFile)).resolves.toMatchObject([
      { name: 'Out of stock medicine', stockQuantity: 0, batchNumber: 'ZERO-1' },
    ]);

    const invalidFile = writeWorkbook([{
      'Item Name': 'Missing batch',
      'Current Quantity': 5,
      'Batch Number': '',
    }]);
    await expect(FileParserService.parseExcel(invalidFile)).rejects.toThrow(
      'Row 2: missing required field(s): Batch Number',
    );
  });
});
