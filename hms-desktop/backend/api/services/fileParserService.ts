import fs from 'fs';

// Heavy parsers are lazy-loaded inside parse* methods so requiring medicine routes
// at server startup does not load pdf-parse / mammoth / xlsx (avoids SIGBUS on some
// EC2 + Node combinations until an import actually runs).

export interface ParsedMedicine {
  name: string;
  genericName?: string;
  manufacturer?: string;
  category?: string;
  therapeuticClass?: string;
  atcCode?: string;
  price: number;
  currency?: string; // Detected currency from column header (e.g., "INR", "USD")
  priceColumnHeader?: string; // Original column header (e.g., "Price(INR)")
  stockQuantity: number;
  lowStockThreshold: number;
  expiryDate?: Date;
}

export class FileParserService {
  static async parseExcel(filePath: string): Promise<ParsedMedicine[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx') as typeof import('xlsx');
      const workbook = XLSX.readFile(filePath);
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Excel file has no sheets');
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in Excel file`);
      }
      
      // Convert sheet to JSON with header row
      const data = XLSX.utils.sheet_to_json(worksheet, { 
        defval: '', // Default value for empty cells
        raw: false // Convert all values to strings first
      });
      
      // Debug: Log first row to see actual column names
      if (data && data.length > 0) {
        console.log('Excel import - First row keys:', Object.keys(data[0]));
        console.log('Excel import - First row sample:', JSON.stringify(data[0], null, 2));
      }
      
      if (!data || data.length === 0) {
        throw new Error('Excel file contains no data rows');
      }
      
      // Helper function to normalize column names (remove common suffixes, trim, lowercase)
      const normalizeColumnName = (name: string): string => {
        return name
          .toLowerCase()
          .replace(/\s*\(required\)/gi, '') // Remove "(required)"
          .replace(/\s*\(optional\)/gi, '') // Remove "(optional)"
          .replace(/\s*\(.*?\)/g, '') // Remove any other parentheses content
          .replace(/[_-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Column position is intentionally irrelevant: every field is mapped by
      // its normalized header. Reject incomplete templates before importing.
      const normalizedHeaders = Object.keys(data[0] as Record<string, unknown>).map(normalizeColumnName);
      const requiredHeaders = [
        { label: 'Medicine Name', aliases: ['medicine name', 'name', 'medicine', 'drug name', 'product name'] },
        { label: 'Generic Name', aliases: ['generic name', 'generic', 'generic name inn'] },
        { label: 'Manufacturer', aliases: ['manufacturer', 'company', 'company name', 'brand', 'supplier'] },
        { label: 'Category', aliases: ['category', 'type', 'medicine category', 'drug category', 'class'] },
        { label: 'Price', aliases: ['price', 'cost', 'unit price', 'selling price', 'mrp'] },
        { label: 'Stock Quantity', aliases: ['quantity', 'stock', 'stock quantity', 'available stock', 'qty', 'units'] },
        { label: 'Low Stock Threshold', aliases: ['low stock threshold', 'threshold', 'minimum stock', 'reorder level'] },
      ];
      const missingHeaders = requiredHeaders
        .filter(({ aliases }) => !aliases.some((alias) => normalizedHeaders.includes(normalizeColumnName(alias))))
        .map(({ label }) => label);

      if (missingHeaders.length > 0) {
        throw new Error(`Missing required column(s): ${missingHeaders.join(', ')}`);
      }

      // Helper function to find column value (case-insensitive, handles various formats)
      const getColumnValue = (row: any, ...possibleNames: string[]): string => {
        // First, normalize all possible names
        const normalizedPossibleNames = possibleNames.map(normalizeColumnName);
        
        // Normalize all keys in the row
        const normalizedRow: Record<string, string> = {};
        const keyMapping: Record<string, string> = {}; // Map normalized key to original key
        for (const key in row) {
          const normalizedKey = normalizeColumnName(key);
          if (!normalizedRow[normalizedKey] || (row[key] !== undefined && row[key] !== null && row[key] !== '')) {
            normalizedRow[normalizedKey] = String(row[key] || '').trim();
            keyMapping[normalizedKey] = key; // Store original key
          }
        }
        
        // Try to find a match
        for (let i = 0; i < normalizedPossibleNames.length; i++) {
          const normalizedName = normalizedPossibleNames[i];
          const originalName = possibleNames[i];
          
          // Try exact match first (original name - case sensitive)
          if (row[originalName] !== undefined && row[originalName] !== null && row[originalName] !== '') {
            return String(row[originalName]).trim();
          }
          
          // Try case-insensitive exact match
          for (const key in row) {
            if (key.toLowerCase() === originalName.toLowerCase() && row[key] !== undefined && row[key] !== null && row[key] !== '') {
              return String(row[key]).trim();
            }
          }
          
          // Try normalized match
          if (normalizedRow[normalizedName] && normalizedRow[normalizedName] !== '') {
            return normalizedRow[normalizedName];
          }
          
          // Try partial match (contains the normalized name)
          for (const key in normalizedRow) {
            if (key.includes(normalizedName) || normalizedName.includes(key)) {
              if (normalizedRow[key] && normalizedRow[key] !== '') {
                return normalizedRow[key];
              }
            }
          }
        }
        return '';
      };
      
      return data.map((row: any, index: number) => {
        // Get medicine name (required field)
        const name = getColumnValue(
          row,
          'Medicine Name (required)', 'Medicine Name', 'Name', 'medicine_name', 'Medicine', 
          'Drug Name', 'drug_name', 'Product Name', 'product_name'
        );
        
        // Get other fields
        const genericName = getColumnValue(
          row,
          'Generic Name', 'Generic', 'generic_name', 'Generic Name (INN)'
        );
        
        const manufacturer = getColumnValue(
          row,
          'Manufacturer', 'Company', 'manufacturer', 'Company Name', 
          'Brand', 'brand', 'Supplier', 'supplier'
        );
        
        const category = getColumnValue(
          row,
          'Category', 'Type', 'category', 'Medicine Category', 
          'Drug Category', 'drug_category', 'Class', 'class'
        ) || 'General';
        
        const therapeuticClass = getColumnValue(
          row,
          'Therapeutic Class', 'Therapeutic', 'therapeutic_class', 
          'Therapeutic Category', 'therapeutic_category'
        );
        
        const atcCode = getColumnValue(
          row,
          'ATC Code', 'ATC', 'atc_code', 'ATC Classification'
        );
        
        // Parse price (handle various formats)
        // Also detect currency from column header (e.g., "Price(INR)", "Price (USD)")
        let priceColumnHeader = '';
        const priceColumnKeys = ['Price', 'Cost', 'price', 'Unit Price', 'unit_price', 
          'Selling Price', 'selling_price', 'MRP', 'mrp', 'Price(INR)', 'Price (INR)',
          'Price(USD)', 'Price (USD)', 'Price(EUR)', 'Price (EUR)'];
        
        for (const key of priceColumnKeys) {
          if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
            priceColumnHeader = key;
            break;
          }
        }
        
        const priceStr = getColumnValue(
          row,
          'Price', 'Cost', 'price', 'Unit Price', 'unit_price', 
          'Selling Price', 'selling_price', 'MRP', 'mrp', 'Price(INR)', 'Price (INR)',
          'Price(USD)', 'Price (USD)', 'Price(EUR)', 'Price (EUR)'
        );
        const price = parseFloat(priceStr.replace(/[^\d.-]/g, '')) || 0;
        
        // Extract currency from column header if present (e.g., "Price(INR)" -> "INR")
        let detectedCurrency = '';
        if (priceColumnHeader) {
          const currencyMatch = priceColumnHeader.match(/\(([A-Z]{3})\)/i);
          if (currencyMatch) {
            detectedCurrency = currencyMatch[1].toUpperCase();
          }
        }
        
        // Parse stock quantity
        const quantityStr = getColumnValue(
          row,
          'Quantity', 'Stock', 'stock_quantity', 'Stock Quantity', 
          'Available Stock', 'available_stock', 'Qty', 'qty', 'Units', 'units'
        );
        const stockQuantity = parseInt(quantityStr.replace(/[^\d]/g, '')) || 0;
        
        // Parse low stock threshold
        const thresholdStr = getColumnValue(
          row,
          'Low Stock Threshold', 'Threshold', 'low_stock_threshold', 
          'Minimum Stock', 'minimum_stock', 'Reorder Level', 'reorder_level'
        );
        const lowStockThreshold = parseInt(thresholdStr.replace(/[^\d]/g, '')) || 10;
        
        // Parse expiry date
        const expiryDateStr = getColumnValue(
          row,
          'Expiry Date', 'expiry_date', 'Expiry', 'expiry', 
          'Expiration Date', 'expiration_date', 'Valid Until', 'valid_until'
        );
        let expiryDate: Date | undefined;
        if (expiryDateStr) {
          // Try to parse date - Excel dates might be numbers
          const dateNum = parseFloat(expiryDateStr);
          if (!isNaN(dateNum) && dateNum > 25569) {
            // Excel date serial number (days since 1900-01-01)
            // Convert Excel serial date to JavaScript Date
            const excelEpoch = new Date(1899, 11, 30); // Excel epoch is 1899-12-30
            expiryDate = new Date(excelEpoch.getTime() + dateNum * 86400000);
          } else {
            // Try parsing as date string
            const parsed = new Date(expiryDateStr);
            if (!isNaN(parsed.getTime())) {
              expiryDate = parsed;
            }
          }
        }
        
        return {
          name: name,
          genericName: genericName || undefined,
          manufacturer: manufacturer || undefined,
          category: category,
          therapeuticClass: therapeuticClass || undefined,
          atcCode: atcCode || undefined,
          price: price,
          currency: detectedCurrency || undefined, // Include detected currency
          priceColumnHeader: priceColumnHeader || undefined, // Include original column header
          stockQuantity: stockQuantity,
          lowStockThreshold: lowStockThreshold,
          expiryDate: expiryDate
        };
      }).filter(medicine => {
        // Filter out rows without names, but log what we're filtering
        if (!medicine.name || medicine.name.length === 0) {
          console.log('Filtered out row - no medicine name found');
          return false;
        }
        return true;
      });
    } catch (error: any) {
      throw new Error(`Failed to parse Excel file: ${error.message || 'Unknown error'}`);
    }
  }

  static async parsePDF(filePath: string): Promise<ParsedMedicine[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    const medicines: ParsedMedicine[] = [];
    const lines = data.text.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
    
    // Try to detect table structure
    // Look for header row patterns
    let headerRowIndex = -1;
    const headerPatterns = [
      /medicine.*name/i,
      /generic.*name/i,
      /manufacturer/i,
      /category/i,
      /price/i,
      /quantity|stock/i
    ];
    
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const headerMatches = headerPatterns.filter(pattern => pattern.test(lines[i]));
      if (headerMatches.length >= 3) {
        headerRowIndex = i;
        break;
      }
    }
    
    // If header found, parse table structure
    if (headerRowIndex >= 0) {
      const headerLine = lines[headerRowIndex];
      // Detect column separators (tabs, multiple spaces, or pipes)
      const isTabSeparated = headerLine.includes('\t');
      const isPipeSeparated = headerLine.includes('|');
      
      // Extract column indices
      const columns = this.extractPDFColumns(headerLine, isTabSeparated, isPipeSeparated);
      
      // Parse data rows
      for (let i = headerRowIndex + 1; i < lines.length; i++) {
        const medicine = this.parsePDFRow(lines[i], columns, isTabSeparated, isPipeSeparated);
        if (medicine && medicine.name) {
          medicines.push(medicine);
        }
      }
    } else {
      // Fallback: Try to parse as space-separated or comma-separated
      for (const line of lines) {
        // Skip lines that look like headers or are too short
        if (line.length < 10 || /^[^\w]/.test(line)) continue;
        
        // Try different separators
        let parts: string[] = [];
        if (line.includes('\t')) {
          parts = line.split('\t');
        } else if (line.includes('|')) {
          parts = line.split('|').map(p => p.trim());
        } else if (line.includes(',')) {
          parts = line.split(',').map(p => p.trim());
        } else {
          // Try to split by multiple spaces (table format)
          parts = line.split(/\s{2,}/).map(p => p.trim());
        }
        
        if (parts.length >= 3) {
          const medicine = this.parsePDFRowParts(parts);
          if (medicine && medicine.name) {
            medicines.push(medicine);
          }
        }
      }
    }
    
    return medicines;
  }
  
  private static extractPDFColumns(headerLine: string, isTabSeparated: boolean, isPipeSeparated: boolean): Map<string, number> {
    const columns = new Map<string, number>();
    let parts: string[] = [];
    
    if (isTabSeparated) {
      parts = headerLine.split('\t');
    } else if (isPipeSeparated) {
      parts = headerLine.split('|').map(p => p.trim());
    } else {
      parts = headerLine.split(/\s{2,}/).map(p => p.trim());
    }
    
    parts.forEach((part, index) => {
      const normalized = part.toLowerCase().trim();
      if (normalized.includes('medicine') || normalized.includes('name')) {
        columns.set('name', index);
      } else if (normalized.includes('generic')) {
        columns.set('genericName', index);
      } else if (normalized.includes('manufacturer') || normalized.includes('company')) {
        columns.set('manufacturer', index);
      } else if (normalized.includes('category') || normalized.includes('type')) {
        columns.set('category', index);
      } else if (normalized.includes('therapeutic') || normalized.includes('class')) {
        columns.set('therapeuticClass', index);
      } else if (normalized.includes('atc')) {
        columns.set('atcCode', index);
      } else if (normalized.includes('price') || normalized.includes('cost')) {
        columns.set('price', index);
      } else if (normalized.includes('quantity') || normalized.includes('stock')) {
        columns.set('stockQuantity', index);
      } else if (normalized.includes('threshold') || normalized.includes('low')) {
        columns.set('lowStockThreshold', index);
      } else if (normalized.includes('expiry') || normalized.includes('exp')) {
        columns.set('expiryDate', index);
      }
    });
    
    return columns;
  }
  
  private static parsePDFRow(row: string, columns: Map<string, number>, isTabSeparated: boolean, isPipeSeparated: boolean): ParsedMedicine | null {
    let parts: string[] = [];
    
    if (isTabSeparated) {
      parts = row.split('\t');
    } else if (isPipeSeparated) {
      parts = row.split('|').map(p => p.trim());
    } else {
      parts = row.split(/\s{2,}/).map(p => p.trim());
    }
    
    if (parts.length === 0) return null;
    
    return this.parsePDFRowParts(parts, columns);
  }
  
  private static parsePDFRowParts(parts: string[], columns?: Map<string, number>): ParsedMedicine | null {
    if (parts.length < 2) return null;
    
    // If columns map provided, use it
    if (columns && columns.size > 0) {
      const getValue = (key: string): string | undefined => {
        const index = columns.get(key);
        return index !== undefined && parts[index] ? parts[index].trim() : undefined;
      };
      
      const name = getValue('name') || parts[0];
      if (!name || name.length < 2) return null;
      
      return {
        name: name,
        genericName: getValue('genericName'),
        manufacturer: getValue('manufacturer'),
        category: getValue('category') || 'General',
        therapeuticClass: getValue('therapeuticClass'),
        atcCode: getValue('atcCode'),
        price: parseFloat(getValue('price') || parts.find(p => /^\d+\.?\d*$/.test(p)) || '0') || 0,
        stockQuantity: parseInt(getValue('stockQuantity') || parts.find(p => /^\d+$/.test(p)) || '0') || 0,
        lowStockThreshold: parseInt(getValue('lowStockThreshold') || '10') || 10,
        expiryDate: getValue('expiryDate') ? this.parseDate(getValue('expiryDate')!) : undefined
      };
    }
    
    // Fallback: assume first column is name, try to find numbers for price and quantity
    const name = parts[0];
    if (!name || name.length < 2) return null;
    
    // Find price (usually a decimal number)
    let price = 0;
    let stockQuantity = 0;
    for (let i = 1; i < parts.length; i++) {
      const num = parseFloat(parts[i]);
      if (!isNaN(num)) {
        if (num % 1 !== 0 && price === 0) {
          // Decimal number, likely price
          price = num;
        } else if (num % 1 === 0 && stockQuantity === 0) {
          // Integer, likely quantity
          stockQuantity = num;
        }
      }
    }
    
    return {
      name: name,
      genericName: parts.length > 1 && !/^\d/.test(parts[1]) ? parts[1] : undefined,
      manufacturer: parts.length > 2 && !/^\d/.test(parts[2]) ? parts[2] : undefined,
      category: 'General',
      price: price,
      stockQuantity: stockQuantity,
      lowStockThreshold: 10
    };
  }
  
  private static parseDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined;
    
    // Try various date formats
    const formats = [
      /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
      /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (format === formats[0]) {
          return new Date(`${match[1]}-${match[2]}-${match[3]}`);
        } else if (format === formats[1]) {
          return new Date(`${match[3]}-${match[1]}-${match[2]}`);
        } else {
          return new Date(`${match[3]}-${match[2]}-${match[1]}`);
        }
      }
    }
    
    // Try direct Date parsing
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }

  static async parseWord(filePath: string): Promise<ParsedMedicine[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as typeof import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    
    // Basic Word parsing - customize based on your document format
    const lines = text.split('\n');
    const medicines: ParsedMedicine[] = [];
    
    for (const line of lines) {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          medicines.push({
            name: parts[0],
            price: parseFloat(parts[1]) || 0,
            stockQuantity: parseInt(parts[2]) || 0,
            lowStockThreshold: 10,
            category: 'General'
          });
        }
      }
    }
    
    return medicines;
  }

  static async parseFile(filePath: string, fileType: string): Promise<ParsedMedicine[]> {
    switch (fileType) {
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        return this.parseExcel(filePath);
      case 'application/pdf':
        return this.parsePDF(filePath);
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.parseWord(filePath);
      default:
        throw new Error('Unsupported file type');
    }
  }
}
