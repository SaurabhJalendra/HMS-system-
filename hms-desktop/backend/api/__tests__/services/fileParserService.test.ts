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
      'Low Stock Threshold': 5,
      Category: 'Painkiller',
      'Stock Quantity': 25,
      Manufacturer: 'Example Pharma',
      Price: 12.5,
      'Medicine Name': 'ExampleMed',
      'Generic Name': 'Example Salt',
    }]);

    const medicines = await FileParserService.parseExcel(file);

    expect(medicines).toHaveLength(1);
    expect(medicines[0]).toMatchObject({
      name: 'ExampleMed',
      genericName: 'Example Salt',
      manufacturer: 'Example Pharma',
      category: 'Painkiller',
      price: 12.5,
      stockQuantity: 25,
      lowStockThreshold: 5,
    });
  });

  it('rejects a workbook that is missing a required column', async () => {
    const file = writeWorkbook([{
      'Medicine Name': 'ExampleMed',
      'Generic Name': 'Example Salt',
      Manufacturer: 'Example Pharma',
      Category: 'Painkiller',
      Price: 12.5,
      'Stock Quantity': 25,
    }]);

    await expect(FileParserService.parseExcel(file)).rejects.toThrow(
      'Missing required column(s): Low Stock Threshold',
    );
  });
});
