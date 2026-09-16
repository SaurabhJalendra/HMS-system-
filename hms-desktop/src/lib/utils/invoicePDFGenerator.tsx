// Professional Invoice PDF Generator - Apollo Hospitals Style
// Supports both OPD billing and IPD billing formats

import generateInvoiceFooter from './invoiceFooterGenerator';

// Convert number to words (Indian numbering system)
function numberToWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  
  const convertHundreds = (num) => {
    let result = '';
    if (num >= 100) {
      result += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      result += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num >= 10) {
      result += teens[num - 10] + ' ';
      num = 0;
    }
    if (num > 0) {
      result += ones[num] + ' ';
    }
    return result.trim();
  };

  const convert = (num) => {
    if (num === 0) return 'Zero';
    let result = '';
    
    if (num >= 10000000) {
      result += convertHundreds(Math.floor(num / 10000000)) + ' Crore ';
      num %= 10000000;
    }
    if (num >= 100000) {
      result += convertHundreds(Math.floor(num / 100000)) + ' Lakh ';
      num %= 100000;
    }
    if (num >= 1000) {
      result += convertHundreds(Math.floor(num / 1000)) + ' Thousand ';
      num %= 1000;
    }
    if (num > 0) {
      result += convertHundreds(num);
    }
    
    return result.trim();
  };

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);
  
  let words = convert(integerPart) + ' Rupees';
  if (decimalPart > 0) {
    words += ' and ' + convert(decimalPart) + ' Paise';
  }
  
  return words;
}

// Format date like "30-Nov-2023"
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Format time like "10:06 AM"
function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

// Get currency symbol
function getCurrencySymbol(currencyCode) {
  const currencySymbols = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'INR': '₹',
    'JPY': '¥',
    'CNY': '¥',
    'AUD': 'A$',
    'CAD': 'C$',
    'CHF': 'CHF',
    'SGD': 'S$',
    'AED': 'AED',
    'SAR': 'SAR',
    'PKR': '₨',
    'BDT': '৳',
    'LKR': 'Rs',
    'NPR': 'Rs',
    'MYR': 'RM',
    'THB': '฿',
    'IDR': 'Rp',
    'PHP': '₱',
    'VND': '₫',
    'KRW': '₩',
    'ZAR': 'R',
    'BRL': 'R$',
    'MXN': '$',
    'RUB': '₽',
    'TRY': '₺',
    'NGN': '₦',
    'EGP': 'E£',
    'KES': 'KSh',
  };
  
  return currencySymbols[currencyCode] || currencyCode;
}

// Format currency based on hospital config
// CRITICAL: currencyCode should always be provided from hospitalConfig, but we keep USD as absolute fallback
function formatCurrency(amount, currencyCode) {
  // If no currency code provided, log warning but use USD as absolute fallback
  if (!currencyCode) {
    console.warn('[InvoicePDFGenerator] formatCurrency called without currencyCode, using USD as fallback');
    currencyCode = 'USD';
  }
  const symbol = getCurrencySymbol(currencyCode);
  return `${symbol}${Number(amount).toFixed(2)}`;
}

const InvoicePDFGenerator = {
  // Generate OPD Bill/Invoice PDF
  generateOPDBillPDF: (invoiceData) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error(
        'The invoice window could not be opened. Allow pop-ups for ZenHosp, then print again.'
      );
    }

    const hospitalConfig = invoiceData.hospitalConfig || {};
    // CRITICAL: Use displayCurrency if available, otherwise currency, never default to USD
    const currency = hospitalConfig.displayCurrency || hospitalConfig.currency;
    if (!currency) {
      console.error('[InvoicePDFGenerator] No currency found in hospitalConfig!', hospitalConfig);
    }
    const patient = invoiceData.patient || {};
    const items = invoiceData.items || {};
    
    // Build hospital address
    const addressParts = [
      hospitalConfig.address,
      hospitalConfig.city,
      hospitalConfig.state,
      hospitalConfig.postalCode,
      hospitalConfig.country
    ].filter(Boolean);
    const hospitalAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Address not specified';
    
    // Build logo URL - construct full URL if it's a relative path
    let logoUrl = hospitalConfig.logoUrl || '';
    if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('data:')) {
      // Construct full URL using current origin
      const apiBaseUrl = window.location.origin;
      logoUrl = `${apiBaseUrl}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
    }
    
    // Calculate totals
    const subtotal = invoiceData.subtotal || 0;
    const discount = invoiceData.discount || 0;
    const tax = invoiceData.tax || 0;
    const totalAmount = invoiceData.totalAmount || 0;
    
    // Build services table rows - Section-wise
    const buildSectionRows = (sectionName, sectionData) => {
      if (!sectionData || !sectionData.items || sectionData.items.length === 0) return '';
      
      const sectionTitle = sectionName === 'consultation' ? 'Consultation Fees' :
                          sectionName === 'pharmacy' ? 'Pharmacy (Medicines)' :
                          sectionName === 'labTests' ? 'Laboratory Tests' :
                          'Other Charges';
      
      const rows = sectionData.items.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 10pt; padding-left: 20px;">${item.description || 'Item'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 10pt;">${formatCurrency(item.amount || 0, currency)}</td>
        </tr>
      `).join('');
      
      return `
        <tr>
          <td colspan="2" style="padding: 10px 8px 6px 8px; background-color: #f5f5f5; font-weight: bold; font-size: 10pt; border-bottom: 1px solid #000;">${sectionTitle}</td>
        </tr>
        ${rows}
        <tr>
          <td style="padding: 8px; text-align: right; font-weight: bold; font-size: 10pt; border-bottom: 2px solid #ccc;">Section Subtotal:</td>
          <td style="padding: 8px; text-align: right; font-weight: bold; font-size: 10pt; border-bottom: 2px solid #ccc;">${formatCurrency(sectionData.subtotal || 0, currency)}</td>
        </tr>
      `;
    };
    
    // Check if items is in new section-wise format or old array format
    let servicesRows = '';
    if (Array.isArray(items)) {
      // Old format - backward compatibility
      servicesRows = items.map((item, index) => {
        const amount = (item.quantity || 1) * (item.unitPrice || item.price || 0);
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 10pt;">${item.description || item.name || 'Service'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 10pt;">${formatCurrency(amount, currency)}</td>
          </tr>
        `;
      }).join('');
    } else {
      // New section-wise format
      servicesRows = [
        buildSectionRows('consultation', items.consultation),
        buildSectionRows('pharmacy', items.pharmacy),
        buildSectionRows('labTests', items.labTests),
        buildSectionRows('other', items.other)
      ].join('');
    }
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${invoiceData.billNumber || 'N/A'}</title>
        <meta charset="utf-8" />
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 15mm;
            background: white;
            font-size: 10pt;
            line-height: 1.4;
          }
          .invoice-page {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
          }
          .header-section {
            margin-bottom: 8mm;
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 5mm;
          }
          .hospital-logo-container {
            margin-right: 10mm;
            flex-shrink: 0;
          }
          .hospital-logo {
            width: 60mm;
            height: 60mm;
            object-fit: contain;
            border: 1px solid #ddd;
            padding: 2mm;
            background: white;
          }
          .hospital-branding {
            flex: 1;
          }
          .hospital-name {
            font-size: 24pt;
            font-weight: bold;
            color: #000;
            margin-bottom: 2mm;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .hospital-tagline {
            font-size: 9pt;
            color: #666;
            margin-bottom: 3mm;
          }
          .hospital-address {
            font-size: 9pt;
            color: #333;
            line-height: 1.6;
            margin-bottom: 2mm;
          }
          .hospital-contact {
            font-size: 9pt;
            color: #333;
            line-height: 1.6;
          }
          .emergency-box {
            background-color: #dc3545;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 11pt;
            font-weight: bold;
            text-align: center;
            min-width: 120px;
          }
          .invoice-title {
            text-align: center;
            font-size: 18pt;
            font-weight: bold;
            margin: 5mm 0;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          .details-section {
            border: 1px solid #000;
            padding: 5mm;
            margin-bottom: 5mm;
            display: flex;
            gap: 10mm;
          }
          .patient-details {
            flex: 1;
          }
          .bill-details {
            flex: 1;
          }
          .details-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-transform: uppercase;
            border-bottom: 1px solid #000;
            padding-bottom: 2mm;
          }
          .detail-row {
            margin-bottom: 2mm;
            font-size: 10pt;
          }
          .detail-label {
            font-weight: bold;
            display: inline-block;
            min-width: 80px;
          }
          .services-section {
            margin-bottom: 5mm;
          }
          .services-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-transform: uppercase;
          }
          .services-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #000;
          }
          .services-table th {
            background-color: #f0f0f0;
            padding: 8px;
            text-align: left;
            font-weight: bold;
            font-size: 10pt;
            border-bottom: 2px solid #000;
          }
          .services-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
            font-size: 10pt;
          }
          .financial-summary {
            margin-top: 5mm;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 10mm;
          }
          .amount-in-words {
            flex: 1;
            font-size: 10pt;
            font-style: italic;
            color: #333;
            padding: 3mm;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
          }
          .total-amount {
            text-align: right;
            font-size: 12pt;
            font-weight: bold;
            padding: 3mm;
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
          }
          .total-label {
            margin-bottom: 2mm;
          }
          .total-value {
            font-size: 14pt;
          }
          .disclaimer-section {
            margin-top: 8mm;
            padding-top: 5mm;
            border-top: 1px solid #ddd;
            font-size: 8pt;
            color: #666;
            line-height: 1.6;
          }
          .disclaimer-item {
            margin-bottom: 2mm;
          }
          .footer {
            margin-top: 5mm;
            text-align: center;
            font-size: 8pt;
            color: #666;
          }
          @media print {
            body {
              margin: 0;
              padding: 5mm;
            }
            @page {
              size: A4;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-page">
          <!-- Header Section -->
          <div class="header-section">
            <div class="header-top">
              ${logoUrl ? `
                <div class="hospital-logo-container">
                  <img src="${logoUrl}" alt="Hospital Logo" class="hospital-logo" onerror="this.style.display='none'" />
                </div>
              ` : ''}
              <div class="hospital-branding">
                <div class="hospital-name">${hospitalConfig.hospitalName || 'HOSPITAL MANAGEMENT SYSTEM'}</div>
                ${hospitalConfig.tagline ? `<div class="hospital-tagline">${hospitalConfig.tagline}</div>` : ''}
                <div class="hospital-address">${hospitalAddress}</div>
                <div class="hospital-contact">
                  ${hospitalConfig.phone ? `For Appointments and Enquiries, Please Call: ${hospitalConfig.phone}` : ''}
                  ${hospitalConfig.email ? `<br>E-mail Us: ${hospitalConfig.email}` : ''}
                </div>
              </div>
              ${hospitalConfig.emergencyContact ? `
                <div class="emergency-box">
                  EMERGENCY ${hospitalConfig.emergencyContact}
                </div>
              ` : ''}
            </div>
            <div class="invoice-title">INPATIENT BILL</div>
          </div>

          <!-- Patient and Bill Details Section -->
          <div class="details-section">
            <div class="patient-details">
              <div class="details-header">PATIENT DETAILS</div>
              <div class="detail-row">
                <span class="detail-label">Patient Name:</span> ${patient.name || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Address:</span> ${patient.address || 'N/A'}
              </div>
              ${patient.phone ? `
                <div class="detail-row">
                  <span class="detail-label">Phone:</span> ${patient.phone}
                </div>
              ` : ''}
            </div>
            <div class="bill-details">
              <div class="details-header">BILL INFORMATION</div>
              ${invoiceData.billNumber ? `
                <div class="detail-row">
                  <span class="detail-label">Bill No:</span> ${invoiceData.billNumber}
                </div>
              ` : ''}
              ${invoiceData.ipNumber ? `
                <div class="detail-row">
                  <span class="detail-label">IP No:</span> ${invoiceData.ipNumber}
                </div>
              ` : ''}
              ${invoiceData.idNumber ? `
                <div class="detail-row">
                  <span class="detail-label">ID No:</span> ${invoiceData.idNumber}
                </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">Bill Dt/Time:</span> ${formatDate(invoiceData.billDate)} ${formatTime(invoiceData.billDate)}
              </div>
              ${invoiceData.admissionDate ? `
                <div class="detail-row">
                  <span class="detail-label">Admission Dt/Time:</span> ${formatDate(invoiceData.admissionDate)} ${formatTime(invoiceData.admissionDate)}
                </div>
              ` : ''}
              ${invoiceData.dischargeDate ? `
                <div class="detail-row">
                  <span class="detail-label">Discharge Dt/Time:</span> ${formatDate(invoiceData.dischargeDate)} ${formatTime(invoiceData.dischargeDate)}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Services Breakdown Section -->
          <div class="services-section">
            <div class="services-header">DETAILS</div>
            <table class="services-table">
              <thead>
                <tr>
                  <th style="width: 70%;">Service Name</th>
                  <th style="width: 30%; text-align: right;">Amount (${getCurrencySymbol(currency)})</th>
                </tr>
              </thead>
              <tbody>
                ${servicesRows}
                ${discount > 0 ? `
                  <tr>
                    <td style="text-align: right; font-weight: bold; padding-top: 10px;">Discount:</td>
                    <td style="text-align: right; font-weight: bold; padding-top: 10px;">${formatCurrency(discount, currency)}</td>
                  </tr>
                ` : ''}
                ${tax > 0 ? `
                  <tr>
                    <td style="text-align: right; font-weight: bold;">Tax:</td>
                    <td style="text-align: right; font-weight: bold;">${formatCurrency(tax, currency)}</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>

          <!-- Financial Summary -->
          <div class="financial-summary">
            <div class="amount-in-words">
              <strong>In Words:</strong> ${numberToWords(totalAmount)}
            </div>
            <div class="total-amount">
              <div class="total-label">Bill Amount</div>
              <div class="total-value">${formatCurrency(totalAmount, currency)}</div>
            </div>
          </div>

          ${invoiceData.refundableDeposit !== undefined ? `
            <div style="margin-top: 5mm; font-size: 10pt;">
              <strong>Refundable Deposit As On ${formatDate(invoiceData.depositDate)} ${formatTime(invoiceData.depositDate)}</strong> ${formatCurrency(invoiceData.refundableDeposit, currency)}
            </div>
          ` : ''}

          <!-- Disclaimers Section -->
          <div class="disclaimer-section">
            <div class="disclaimer-item">
              <strong>Statement Type:</strong> This is a computer generated statement and requires no signature.
            </div>
            ${hospitalConfig.insuranceValidityNote ? `
              <div class="disclaimer-item">
                <strong>Insurance Validity:</strong> ${hospitalConfig.insuranceValidityNote}
              </div>
            ` : ''}
            ${hospitalConfig.billingEmail ? `
              <div class="disclaimer-item">
                For billing and general enquiries, please mail: ${hospitalConfig.billingEmail}
              </div>
            ` : ''}
          </div>

          ${(() => {
            const footerText = generateInvoiceFooter(hospitalConfig);
            return footerText ? `
              <!-- Invoice Footer Text -->
              <div class="footer-text" style="margin-top: 8mm; padding: 4mm; font-size: 9pt; color: #333; line-height: 1.6; border-top: 1px solid #ddd; white-space: pre-wrap; font-family: monospace;">
                ${footerText}
              </div>
            ` : '';
          })()}

          <!-- Footer -->
          <div class="footer">
            © ${hospitalConfig.hospitalName || 'Hospital Management System'} ${new Date().getFullYear()}, All rights reserved
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  },

  // Generate IPD Bill PDF (Inpatient Bill)
  generateIPDBillPDF: (invoiceData) => {
    const printWindow = window.open('', '_blank');
    
    const hospitalConfig = invoiceData.hospitalConfig || {};
    // CRITICAL: Use displayCurrency if available, otherwise currency, never default to USD
    const currency = hospitalConfig.displayCurrency || hospitalConfig.currency;
    if (!currency) {
      console.error('[InvoicePDFGenerator] No currency found in hospitalConfig!', hospitalConfig);
    } else {
      console.log('[InvoicePDFGenerator] Generating IPD bill with currency:', currency);
    }
    const patient = invoiceData.patient || {};
    const admission = invoiceData.admission || {};
    
    // Build hospital address
    const addressParts = [
      hospitalConfig.address,
      hospitalConfig.city,
      hospitalConfig.state,
      hospitalConfig.postalCode,
      hospitalConfig.country
    ].filter(Boolean);
    const hospitalAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Address not specified';
    
    // Build logo URL - construct full URL if it's a relative path
    let logoUrl = hospitalConfig.logoUrl || '';
    if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('data:')) {
      // Construct full URL using current origin
      const apiBaseUrl = window.location.origin;
      logoUrl = `${apiBaseUrl}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
    }
    
    // Build services from IPD bill structure
    const services = [];
    if (invoiceData.roomCharges > 0) {
      services.push({ name: 'ROOM RENT', amount: invoiceData.roomCharges });
    }
    if (invoiceData.medicineCharges > 0) {
      services.push({ name: 'PHARMACY', amount: invoiceData.medicineCharges });
    }
    if (invoiceData.procedureCharges > 0) {
      services.push({ name: 'MEDICAL EQUIPMENT', amount: invoiceData.procedureCharges });
    }
    if (invoiceData.consultationCharges > 0) {
      services.push({ name: 'CONSULTATIONS', amount: invoiceData.consultationCharges });
    }
    if (invoiceData.otherCharges > 0) {
      services.push({ name: 'CONSUMABLES', amount: invoiceData.otherCharges });
    }
    if (invoiceData.labCharges > 0) {
      services.push({ name: 'INVESTIGATIONS', amount: invoiceData.labCharges });
    }
    
    const totalAmount = invoiceData.totalAmount || 0;
    
    // Build services table rows
    const servicesRows = services.map(service => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 10pt;">${service.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 10pt;">${formatCurrency(service.amount, currency)}</td>
      </tr>
    `).join('');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Inpatient Bill - ${invoiceData.billNumber || 'N/A'}</title>
        <meta charset="utf-8" />
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 15mm;
            background: white;
            font-size: 10pt;
            line-height: 1.4;
          }
          .invoice-page {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
          }
          .header-section {
            margin-bottom: 8mm;
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 5mm;
          }
          .hospital-logo-container {
            margin-right: 10mm;
            flex-shrink: 0;
          }
          .hospital-logo {
            width: 60mm;
            height: 60mm;
            object-fit: contain;
            border: 1px solid #ddd;
            padding: 2mm;
            background: white;
          }
          .hospital-branding {
            flex: 1;
          }
          .hospital-name {
            font-size: 24pt;
            font-weight: bold;
            color: #000;
            margin-bottom: 2mm;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .hospital-tagline {
            font-size: 9pt;
            color: #666;
            margin-bottom: 3mm;
          }
          .hospital-address {
            font-size: 9pt;
            color: #333;
            line-height: 1.6;
            margin-bottom: 2mm;
          }
          .hospital-contact {
            font-size: 9pt;
            color: #333;
            line-height: 1.6;
          }
          .emergency-box {
            background-color: #dc3545;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 11pt;
            font-weight: bold;
            text-align: center;
            min-width: 120px;
          }
          .invoice-title {
            text-align: center;
            font-size: 18pt;
            font-weight: bold;
            margin: 5mm 0;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          .details-section {
            border: 1px solid #000;
            padding: 5mm;
            margin-bottom: 5mm;
            display: flex;
            gap: 10mm;
          }
          .patient-details {
            flex: 1;
          }
          .bill-details {
            flex: 1;
          }
          .details-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-transform: uppercase;
            border-bottom: 1px solid #000;
            padding-bottom: 2mm;
          }
          .detail-row {
            margin-bottom: 2mm;
            font-size: 10pt;
          }
          .detail-label {
            font-weight: bold;
            display: inline-block;
            min-width: 100px;
          }
          .services-section {
            margin-bottom: 5mm;
          }
          .services-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-transform: uppercase;
          }
          .services-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #000;
          }
          .services-table th {
            background-color: #f0f0f0;
            padding: 8px;
            text-align: left;
            font-weight: bold;
            font-size: 10pt;
            border-bottom: 2px solid #000;
          }
          .services-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
            font-size: 10pt;
          }
          .financial-summary {
            margin-top: 5mm;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 10mm;
          }
          .amount-in-words {
            flex: 1;
            font-size: 10pt;
            font-style: italic;
            color: #333;
            padding: 3mm;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
          }
          .total-amount {
            text-align: right;
            font-size: 12pt;
            font-weight: bold;
            padding: 3mm;
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
          }
          .total-label {
            margin-bottom: 2mm;
          }
          .total-value {
            font-size: 14pt;
          }
          .disclaimer-section {
            margin-top: 8mm;
            padding-top: 5mm;
            border-top: 1px solid #ddd;
            font-size: 8pt;
            color: #666;
            line-height: 1.6;
          }
          .disclaimer-item {
            margin-bottom: 2mm;
          }
          .footer {
            margin-top: 5mm;
            text-align: center;
            font-size: 8pt;
            color: #666;
          }
          @media print {
            body {
              margin: 0;
              padding: 5mm;
            }
            @page {
              size: A4;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-page">
          <!-- Header Section -->
          <div class="header-section">
            <div class="header-top">
              ${logoUrl ? `
                <div class="hospital-logo-container">
                  <img src="${logoUrl}" alt="Hospital Logo" class="hospital-logo" onerror="this.style.display='none'" />
                </div>
              ` : ''}
              <div class="hospital-branding">
                <div class="hospital-name">${hospitalConfig.hospitalName || 'HOSPITAL MANAGEMENT SYSTEM'}</div>
                ${hospitalConfig.tagline ? `<div class="hospital-tagline">${hospitalConfig.tagline}</div>` : ''}
                <div class="hospital-address">${hospitalAddress}</div>
                <div class="hospital-contact">
                  ${hospitalConfig.phone ? `For Appointments and Enquiries, Please Call: ${hospitalConfig.phone}` : ''}
                  ${hospitalConfig.email ? `<br>E-mail Us: ${hospitalConfig.email}` : ''}
                </div>
              </div>
              ${hospitalConfig.emergencyContact ? `
                <div class="emergency-box">
                  EMERGENCY ${hospitalConfig.emergencyContact}
                </div>
              ` : ''}
            </div>
            <div class="invoice-title">INPATIENT BILL</div>
          </div>

          <!-- Patient and Bill Details Section -->
          <div class="details-section">
            <div class="patient-details">
              <div class="details-header">PATIENT DETAILS</div>
              <div class="detail-row">
                <span class="detail-label">Patient Name:</span> ${patient.name || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Address:</span> ${patient.address || 'N/A'}
              </div>
              ${patient.phone ? `
                <div class="detail-row">
                  <span class="detail-label">Phone:</span> ${patient.phone}
                </div>
              ` : ''}
            </div>
            <div class="bill-details">
              <div class="details-header">BILL INFORMATION</div>
              ${invoiceData.billNumber ? `
                <div class="detail-row">
                  <span class="detail-label">Bill No:</span> ${invoiceData.billNumber}
                </div>
              ` : ''}
              ${invoiceData.ipNumber || admission.id ? `
                <div class="detail-row">
                  <span class="detail-label">IP No:</span> ${invoiceData.ipNumber || admission.id}
                </div>
              ` : ''}
              ${patient.id ? `
                <div class="detail-row">
                  <span class="detail-label">ID No:</span> ${patient.id}
                </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">Bill Dt/Time:</span> ${formatDate(invoiceData.billDate)} ${formatTime(invoiceData.billDate)}
              </div>
              ${admission.admissionDate ? `
                <div class="detail-row">
                  <span class="detail-label">Admission Dt/Time:</span> ${formatDate(admission.admissionDate)} ${formatTime(admission.admissionDate)}
                </div>
              ` : ''}
              ${admission.dischargeDate ? `
                <div class="detail-row">
                  <span class="detail-label">Discharge Dt/Time:</span> ${formatDate(admission.dischargeDate)} ${formatTime(admission.dischargeDate)}
                </div>
              ` : `
                <div class="detail-row">
                  <span class="detail-label">Discharge Dt/Time:</span> ---
                </div>
              `}
            </div>
          </div>

          <!-- Services Breakdown Section -->
          <div class="services-section">
            <div class="services-header">DETAILS</div>
            <table class="services-table">
              <thead>
                <tr>
                  <th style="width: 70%;">Service Name</th>
                  <th style="width: 30%; text-align: right;">Amount (${getCurrencySymbol(currency)})</th>
                </tr>
              </thead>
              <tbody>
                ${servicesRows}
              </tbody>
            </table>
          </div>

          <!-- Financial Summary -->
          <div class="financial-summary">
            <div class="amount-in-words">
              <strong>In Words:</strong> ${numberToWords(totalAmount)}
            </div>
            <div class="total-amount">
              <div class="total-label">Bill Amount</div>
              <div class="total-value">${formatCurrency(totalAmount, currency)}</div>
            </div>
          </div>

          ${invoiceData.refundableDeposit !== undefined ? `
            <div style="margin-top: 5mm; font-size: 10pt;">
              <strong>Refundable Deposit As On ${formatDate(invoiceData.depositDate)} ${formatTime(invoiceData.depositDate)}</strong> ${formatCurrency(invoiceData.refundableDeposit, currency)}
            </div>
          ` : ''}

          <!-- Disclaimers Section -->
          <div class="disclaimer-section">
            <div class="disclaimer-item">
              <strong>Statement Type:</strong> This is a computer generated statement and requires no signature.
            </div>
            ${hospitalConfig.insuranceValidityNote ? `
              <div class="disclaimer-item">
                <strong>Insurance Validity:</strong> ${hospitalConfig.insuranceValidityNote}
              </div>
            ` : `
              <div class="disclaimer-item">
                <strong>Insurance Validity:</strong> This Receipt is valid for an employer or insurer, who contractually obligated to reimburse the medical expenses covered by MediSave and/or MediShield.
              </div>
            `}
            ${hospitalConfig.billingEmail || hospitalConfig.email ? `
              <div class="disclaimer-item">
                For billing and general enquiries, please mail: ${hospitalConfig.billingEmail || hospitalConfig.email}
              </div>
            ` : ''}
          </div>

          ${(() => {
            const footerText = generateInvoiceFooter(hospitalConfig);
            return footerText ? `
              <!-- Invoice Footer Text -->
              <div class="footer-text" style="margin-top: 8mm; padding: 4mm; font-size: 9pt; color: #333; line-height: 1.6; border-top: 1px solid #ddd; white-space: pre-wrap; font-family: monospace;">
                ${footerText}
              </div>
            ` : '';
          })()}

          <!-- Footer -->
          <div class="footer">
            © ${hospitalConfig.hospitalName || 'Hospital Management System'} ${new Date().getFullYear()}, All rights reserved
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  },

  // Generate Purchase Order / Medicine Stock Order Invoice PDF
  generatePurchaseOrderPDF: (orderData) => {
    const printWindow = window.open('', '_blank');
    
    const hospitalConfig = orderData.hospitalConfig || {};
    // CRITICAL: Use displayCurrency if available, otherwise currency, never default to USD
    const currency = hospitalConfig.displayCurrency || hospitalConfig.currency;
    if (!currency) {
      console.error('[InvoicePDFGenerator] No currency found in hospitalConfig!', hospitalConfig);
    } else {
      console.log('[InvoicePDFGenerator] Generating Purchase Order with currency:', currency);
    }
    const supplier = orderData.supplier || {};
    const orderItems = orderData.orderItems || [];
    
    // Build hospital address
    const addressParts = [
      hospitalConfig.address,
      hospitalConfig.city,
      hospitalConfig.state,
      hospitalConfig.postalCode,
      hospitalConfig.country
    ].filter(Boolean);
    const hospitalAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Address not specified';
    
    // Build supplier address
    const supplierAddressParts = [
      supplier.address,
      supplier.city,
      supplier.state,
      supplier.postalCode,
      supplier.country
    ].filter(Boolean);
    const supplierAddress = supplierAddressParts.length > 0 ? supplierAddressParts.join(', ') : 'Address not specified';
    
    // Calculate totals
    const subtotal = orderData.totalAmount || 0;
    const taxAmount = orderData.taxAmount || 0;
    const totalAmount = subtotal + taxAmount;
    
    // Build order items rows
    const itemsRows = orderItems.map((item, index) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; font-size: 10pt;">${index + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 10pt;">${item.medicine?.name || item.medicineName || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; font-size: 10pt;">${item.quantity || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 10pt;">${formatCurrency(item.unitPrice || 0, currency)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 10pt;">${formatCurrency(item.totalPrice || 0, currency)}</td>
      </tr>
    `).join('');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order - ${orderData.orderNumber || 'N/A'}</title>
        <meta charset="utf-8" />
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 15mm;
            background: white;
            font-size: 10pt;
            line-height: 1.4;
          }
          .purchase-order-page {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
          }
          .header-section {
            margin-bottom: 8mm;
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 5mm;
          }
          .hospital-logo-container {
            margin-right: 10mm;
            flex-shrink: 0;
          }
          .hospital-logo {
            width: 60mm;
            height: 60mm;
            object-fit: contain;
            border: 1px solid #ddd;
            padding: 2mm;
            background: white;
          }
          .hospital-branding {
            flex: 1;
          }
          .hospital-name {
            font-size: 24pt;
            font-weight: bold;
            color: #000;
            margin-bottom: 2mm;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .hospital-tagline {
            font-size: 9pt;
            color: #666;
            margin-bottom: 3mm;
          }
          .hospital-address {
            font-size: 9pt;
            color: #333;
            line-height: 1.6;
            margin-bottom: 2mm;
          }
          .hospital-contact {
            font-size: 9pt;
            color: #333;
            line-height: 1.6;
          }
          .po-title {
            text-align: center;
            font-size: 18pt;
            font-weight: bold;
            margin: 5mm 0;
            text-transform: uppercase;
            letter-spacing: 2px;
            background-color: #0066cc;
            color: white;
            padding: 5mm;
          }
          .details-section {
            border: 1px solid #000;
            padding: 5mm;
            margin-bottom: 5mm;
            display: flex;
            gap: 10mm;
          }
          .supplier-details {
            flex: 1;
          }
          .order-details {
            flex: 1;
          }
          .details-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-transform: uppercase;
            border-bottom: 1px solid #000;
            padding-bottom: 2mm;
          }
          .detail-row {
            margin-bottom: 2mm;
            font-size: 10pt;
          }
          .detail-label {
            font-weight: bold;
            display: inline-block;
            min-width: 120px;
          }
          .items-section {
            margin-bottom: 5mm;
          }
          .items-header {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-transform: uppercase;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #000;
          }
          .items-table th {
            background-color: #f0f0f0;
            padding: 8px;
            text-align: left;
            font-weight: bold;
            font-size: 10pt;
            border-bottom: 2px solid #000;
          }
          .items-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
            font-size: 10pt;
          }
          .financial-summary {
            margin-top: 5mm;
            display: flex;
            justify-content: flex-end;
          }
          .totals-box {
            min-width: 250px;
            border: 2px solid #000;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 10px;
            border-bottom: 1px solid #ccc;
            font-size: 10pt;
          }
          .total-row:last-child {
            border-bottom: none;
            background-color: #f0f0f0;
            font-weight: bold;
            font-size: 12pt;
          }
          .amount-in-words {
            margin-top: 5mm;
            font-size: 10pt;
            font-style: italic;
            color: #333;
            padding: 3mm;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
          }
          .terms-section {
            margin-top: 8mm;
            padding-top: 5mm;
            border-top: 1px solid #ddd;
            font-size: 9pt;
            color: #333;
            line-height: 1.6;
          }
          .terms-header {
            font-weight: bold;
            font-size: 10pt;
            margin-bottom: 3mm;
          }
          .term-item {
            margin-bottom: 2mm;
            padding-left: 5mm;
          }
          .signature-section {
            margin-top: 10mm;
            display: flex;
            justify-content: space-between;
          }
          .signature-box {
            text-align: center;
            padding-top: 10mm;
            border-top: 1px solid #000;
            min-width: 150px;
          }
          @media print {
            body {
              margin: 0;
              padding: 5mm;
            }
            @page {
              size: A4;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="purchase-order-page">
          <!-- Header Section -->
          <div class="header-section">
            <div class="header-top">
              <div class="hospital-branding">
                <div class="hospital-name">${hospitalConfig.hospitalName || 'HOSPITAL MANAGEMENT SYSTEM'}</div>
                ${hospitalConfig.tagline ? `<div class="hospital-tagline">${hospitalConfig.tagline}</div>` : ''}
                <div class="hospital-address">${hospitalAddress}</div>
                <div class="hospital-contact">
                  ${hospitalConfig.phone ? `Phone: ${hospitalConfig.phone}` : ''}
                  ${hospitalConfig.email ? `<br>Email: ${hospitalConfig.email}` : ''}
                </div>
              </div>
            </div>
            <div class="po-title">PURCHASE ORDER</div>
          </div>

          <!-- Supplier and Order Details Section -->
          <div class="details-section">
            <div class="supplier-details">
              <div class="details-header">SUPPLIER DETAILS</div>
              <div class="detail-row">
                <span class="detail-label">Supplier Name:</span> ${supplier.name || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Contact Person:</span> ${supplier.contactPerson || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Phone:</span> ${supplier.phone || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Email:</span> ${supplier.email || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Address:</span> ${supplierAddress}
              </div>
            </div>
            <div class="order-details">
              <div class="details-header">ORDER INFORMATION</div>
              <div class="detail-row">
                <span class="detail-label">PO Number:</span> ${orderData.orderNumber || 'N/A'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Order Date:</span> ${formatDate(orderData.orderDate)}
              </div>
              ${orderData.expectedDelivery ? `
                <div class="detail-row">
                  <span class="detail-label">Expected Delivery:</span> ${formatDate(orderData.expectedDelivery)}
                </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">Status:</span> ${orderData.status || 'PENDING'}
              </div>
              <div class="detail-row">
                <span class="detail-label">Payment Status:</span> ${orderData.paymentStatus || 'PENDING'}
              </div>
            </div>
          </div>

          <!-- Order Items Section -->
          <div class="items-section">
            <div class="items-header">ORDER ITEMS</div>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 5%; text-align: center;">#</th>
                  <th style="width: 45%;">Medicine Name</th>
                  <th style="width: 15%; text-align: center;">Quantity</th>
                  <th style="width: 17.5%; text-align: right;">Unit Price</th>
                  <th style="width: 17.5%; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          <!-- Financial Summary -->
          <div class="financial-summary">
            <div class="totals-box">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>${formatCurrency(subtotal, currency)}</span>
              </div>
              ${taxAmount > 0 ? `
                <div class="total-row">
                  <span>Tax (${orderData.taxRate || 0}%):</span>
                  <span>${formatCurrency(taxAmount, currency)}</span>
                </div>
              ` : ''}
              <div class="total-row">
                <span>TOTAL AMOUNT:</span>
                <span>${formatCurrency(totalAmount, currency)}</span>
              </div>
            </div>
          </div>

          <div class="amount-in-words">
            <strong>Amount in Words:</strong> ${numberToWords(totalAmount)}
          </div>

          <!-- Terms and Conditions -->
          <div class="terms-section">
            <div class="terms-header">TERMS & CONDITIONS:</div>
            <div class="term-item">1. All medicines must be delivered within the specified delivery date.</div>
            <div class="term-item">2. Medicines must have a minimum of 12 months shelf life from the date of delivery.</div>
            <div class="term-item">3. Quality certificates and batch details must be provided for all items.</div>
            <div class="term-item">4. Payment will be processed within 30 days of successful delivery and verification.</div>
            <div class="term-item">5. Any discrepancies must be reported within 48 hours of delivery.</div>
            ${orderData.notes ? `
              <div style="margin-top: 3mm; padding-top: 3mm; border-top: 1px solid #ccc;">
                <strong>Additional Notes:</strong> ${orderData.notes}
              </div>
            ` : ''}
          </div>

          <!-- Signature Section -->
          <div class="signature-section">
            <div class="signature-box">
              <div>Prepared By</div>
              <div style="margin-top: 2mm; font-size: 9pt;">${orderData.createdByUser?.fullName || 'N/A'}</div>
            </div>
            <div class="signature-box">
              <div>Approved By</div>
              <div style="margin-top: 2mm; font-size: 9pt;">________________________</div>
            </div>
          </div>

          ${(() => {
            const footerText = generateInvoiceFooter(hospitalConfig);
            return footerText ? `
              <!-- Invoice Footer Text -->
              <div class="footer-text" style="margin-top: 8mm; padding: 4mm; font-size: 9pt; color: #333; line-height: 1.6; border-top: 1px solid #ddd; white-space: pre-wrap; font-family: monospace;">
                ${footerText}
              </div>
            ` : '';
          })()}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
};

export default InvoicePDFGenerator;




