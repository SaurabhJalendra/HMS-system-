import React from 'react';
import { unitsForBillLine } from './prescriptionDispenseUnits';

const PrescriptionPDFGenerator = {
  // Generate prescription PDF (client-side using browser's print functionality)
  generatePrescriptionPDF: (prescriptionData) => {
    const printWindow = window.open('', '_blank');
    
    // Format date like "27-Apr-2020"
    const formatDate = (date) => {
      const d = new Date(date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = String(d.getDate()).padStart(2, '0');
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Format time like "04:37 PM"
    const formatTime = (date) => {
      const d = new Date(date);
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    };

    // Format medicine name with type prefix
    const formatMedicineName = (medicine) => {
      const name = medicine.name || '';
      const upperName = name.toUpperCase();
      if (upperName.includes('TAB') || upperName.includes('TABLET')) {
        return `TAB. ${name.replace(/TABLET|TAB/gi, '').trim()}`;
      } else if (upperName.includes('CAP') || upperName.includes('CAPSULE')) {
        return `CAP. ${name.replace(/CAPSULE|CAP/gi, '').trim()}`;
      } else if (upperName.includes('SYR') || upperName.includes('SYRUP')) {
        return `SYR. ${name.replace(/SYRUP|SYR/gi, '').trim()}`;
      } else if (upperName.includes('INJ') || upperName.includes('INJECTION')) {
        return `INJ. ${name.replace(/INJECTION|INJ/gi, '').trim()}`;
      }
      return name;
    };

    // Format dosage with frequency
    const formatDosage = (item) => {
      const parts = [];
      if (item.frequency) {
        const freq = item.frequency.toUpperCase();
        if (freq.includes('MORNING') || freq.includes('M')) parts.push('1 Morning');
        if (freq.includes('AFTERNOON') || freq.includes('A')) parts.push('1 Aft');
        if (freq.includes('EVENING') || freq.includes('E')) parts.push('1 Eve');
        if (freq.includes('NIGHT') || freq.includes('N')) parts.push('1 Night');
        if (freq.includes('BD') || freq === 'BID') {
          parts.length = 0;
          parts.push('1 Morning', '1 Night');
        }
        if (freq.includes('TID')) {
          parts.length = 0;
          parts.push('1 Morning', '1 Aft', '1 Night');
        }
        if (freq.includes('QID')) {
          parts.length = 0;
          parts.push('1 Morning', '1 Aft', '1 Eve', '1 Night');
        }
      }
      const dosageStr = parts.length > 0 ? parts.join(', ') : (item.frequency || 'As directed');
      const withFood = item.withFood || '';
      if (withFood) {
        const foodTiming = withFood.includes('Before') ? 'Before Food' : 
                          withFood.includes('After') ? 'After Food' : 
                          withFood.includes('Empty') ? 'Empty Stomach' :
                          withFood.includes('Bedtime') ? 'Bedtime' : '';
        return foodTiming ? `${dosageStr} (${foodTiming})` : dosageStr;
      }
      return dosageStr;
    };

    // Calculate total quantity
    const calculateTotalQuantity = (item) => {
      return unitsForBillLine({
        quantity: Number(item.quantity ?? 1),
        frequency: item.frequency,
        duration: Number(item.duration ?? 1),
      });
    };

    // Get medicine type abbreviation
    const getMedicineType = (medicine) => {
      const name = (medicine.name || '').toUpperCase();
      if (name.includes('TAB') || name.includes('TABLET')) return 'Tab';
      if (name.includes('CAP') || name.includes('CAPSULE')) return 'Cap';
      if (name.includes('SYR') || name.includes('SYRUP')) return 'Syrup';
      if (name.includes('INJ') || name.includes('INJECTION')) return 'Inj';
      return 'Tab';
    };

    const patient = prescriptionData.patient || {};
    const doctor = prescriptionData.doctor || {};
    const temperature = prescriptionData.temperature || prescriptionData.consultation?.temperature || '';
    const bloodPressure = prescriptionData.bloodPressure || prescriptionData.consultation?.bloodPressure || '';
    const followUpDate = prescriptionData.followUpDate || prescriptionData.consultation?.followUpDate || '';
    
    // Ensure items array is properly formatted
    const items = (prescriptionData.items || prescriptionData.prescriptionItems || []).map(item => ({
      ...item,
      medicine: item.medicine || item.medicineCatalog || {}
    }));
    
    // Debug: Log consultation history data
    console.log('📄 PDF Generator - Full prescription data keys:', Object.keys(prescriptionData));
    console.log('📄 PDF Generator - Consultation History:', prescriptionData.consultationHistory);
    console.log('📄 PDF Generator - History type:', typeof prescriptionData.consultationHistory);
    console.log('📄 PDF Generator - Is array:', Array.isArray(prescriptionData.consultationHistory));
    console.log('📄 PDF Generator - History length:', prescriptionData.consultationHistory?.length || 0);
    
    // Verify consultation history structure
    if (prescriptionData.consultationHistory && Array.isArray(prescriptionData.consultationHistory)) {
      console.log('📄 PDF Generator - History items:');
      prescriptionData.consultationHistory.forEach((item, idx) => {
        console.log(`  ${idx + 1}.`, {
          hasId: !!item.id,
          hasDate: !!(item.consultationDate || item.createdAt),
          hasDiagnosis: !!item.diagnosis,
          hasNotes: !!item.notes,
          hasDoctor: !!item.doctor
        });
      });
    } else {
      console.warn('⚠️ PDF Generator - Consultation history is not an array or is missing');
    }
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Prescription - ${prescriptionData.prescriptionNumber}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 10mm;
            background: white;
            font-size: 10pt;
            line-height: 1.4;
          }
          .prescription-page {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
          }
          .header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8mm;
            padding-bottom: 5mm;
            border-bottom: 2px solid #000;
          }
          .doctor-info {
            flex: 1;
          }
          .doctor-name {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 2mm;
          }
          .doctor-details {
            font-size: 9pt;
            line-height: 1.6;
          }
          .logo-section {
            flex: 0 0 80px;
            text-align: center;
            margin: 0 10mm;
          }
          .logo {
            width: 60px;
            height: 60px;
            border: 2px solid #000;
            border-radius: 50%;
            margin: 0 auto 2mm;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20pt;
            font-weight: bold;
            overflow: hidden;
            background: white;
          }
          .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 50%;
          }
          .logo-text {
            font-size: 8pt;
            font-weight: bold;
            text-transform: uppercase;
          }
          .clinic-info {
            flex: 1;
            text-align: right;
          }
          .clinic-name {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 2mm;
          }
          .clinic-details {
            font-size: 9pt;
            line-height: 1.6;
          }
          .date-time {
            font-size: 9pt;
            margin-top: 2mm;
            text-align: right;
          }
          .patient-section {
            margin: 5mm 0;
            padding: 3mm 0;
            border-bottom: 1px solid #ccc;
            display: flex;
            align-items: flex-start;
            gap: 5mm;
          }
          .barcode {
            width: 40px;
            height: 60px;
            border: 1px solid #000;
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 2px;
          }
          .barcode-line {
            height: 2px;
            background: #000;
            width: 100%;
          }
          .patient-details {
            flex: 1;
            font-size: 10pt;
            line-height: 1.8;
          }
          .patient-line {
            margin-bottom: 1mm;
          }
          .prescription-body {
            margin: 5mm 0;
            position: relative;
          }
          .medicine-table {
            width: 100%;
            border-collapse: collapse;
            margin-left: 0;
            font-size: 10pt;
          }
          .medicine-table th {
            border-bottom: 2px solid #000;
            padding: 3mm 2mm;
            text-align: left;
            font-weight: bold;
            background: #f9f9f9;
          }
          .medicine-table td {
            padding: 2mm;
            border-bottom: 1px solid #ddd;
            vertical-align: top;
          }
          .medicine-number {
            font-weight: bold;
            width: 30px;
          }
          .medicine-name-col {
            font-weight: bold;
            width: 35%;
          }
          .dosage-col {
            width: 40%;
          }
          .duration-col {
            width: 25%;
          }
          .history-section {
            margin: 5mm 0;
            padding: 3mm;
            border: 1px solid #ddd;
            border-radius: 4px;
            background-color: #f9f9f9;
          }
          .history-title {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-decoration: underline;
            color: #333;
          }
          .history-item {
            margin-bottom: 3mm;
            padding-bottom: 3mm;
            border-bottom: 1px solid #ddd;
          }
          .history-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
          }
          .history-date {
            font-weight: bold;
            font-size: 9pt;
            color: #555;
            margin-bottom: 1mm;
          }
          .history-diagnosis {
            font-size: 9pt;
            color: #333;
            margin-bottom: 1mm;
          }
          .history-notes {
            font-size: 9pt;
            color: #666;
            font-style: italic;
            margin-left: 3mm;
          }
          .history-doctor {
            font-size: 8pt;
            color: #777;
            margin-top: 1mm;
          }
          .advice-section {
            margin: 5mm 0;
            padding: 2mm 0;
          }
          .advice-label {
            font-weight: bold;
            font-size: 10pt;
            margin-bottom: 2mm;
          }
          .advice-list {
            font-size: 10pt;
            line-height: 1.6;
          }
          .follow-up {
            margin: 5mm 0;
            font-size: 10pt;
          }
          .charts-section {
            margin: 8mm 0;
          }
          .charts-title {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-decoration: underline;
          }
          .charts-container {
            display: flex;
            gap: 5mm;
          }
          .chart {
            flex: 1;
            border: 1px solid #ccc;
            padding: 3mm;
            height: 80mm;
            position: relative;
          }
          .chart-title {
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 2mm;
            text-align: center;
          }
          .chart-placeholder {
            width: 100%;
            height: 60mm;
            border: 1px solid #ddd;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            font-size: 8pt;
          }
          .signature-section {
            margin-top: 10mm;
            text-align: right;
            padding-right: 10mm;
          }
          .signature-text {
            font-style: italic;
            font-size: 10pt;
            margin-bottom: 2mm;
          }
          .signature-name {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 1mm;
          }
          .signature-qual {
            font-size: 9pt;
          }
          .watermark {
            position: absolute;
            opacity: 0.05;
            font-size: 120pt;
            font-weight: bold;
            color: #000;
            z-index: -1;
          }
          .watermark-1 {
            top: 150mm;
            left: 20mm;
            transform: rotate(-45deg);
          }
          .watermark-2 {
            top: 150mm;
            right: 20mm;
            transform: rotate(45deg);
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
        <div class="prescription-page">
          <div class="watermark watermark-1">+</div>
          <div class="watermark watermark-2">⚕</div>

          <div class="header-section">
            <div class="doctor-info">
              <div class="doctor-name">Dr. ${doctor.fullName || 'Doctor Name'}</div>
              <div class="doctor-details">
                ${doctor.qualifications || 'M.B.B.S., M.D.'} | Reg. No: ${doctor.registrationNumber || 'N/A'}<br>
                Mob. No: ${doctor.phone || doctor.mobile || 'N/A'}
              </div>
            </div>
            <div class="logo-section">
              ${prescriptionData.hospitalLogoUrl ? `
                <div class="logo">
                  <img src="${prescriptionData.hospitalLogoUrl.startsWith('http') || prescriptionData.hospitalLogoUrl.startsWith('data:') ? prescriptionData.hospitalLogoUrl : (window.location.origin + (prescriptionData.hospitalLogoUrl.startsWith('/') ? '' : '/') + prescriptionData.hospitalLogoUrl)}" alt="Hospital Logo" style="width: 100%; height: 100%; object-fit: contain;" />
                </div>
              ` : `
                <div class="logo" style="font-size: 16pt;">${(prescriptionData.hospitalName || 'HMS').substring(0, 3).toUpperCase()}</div>
              `}
              <div class="logo-text">${(prescriptionData.hospitalName || 'HOSPITAL MANAGEMENT SYSTEM').toUpperCase().replace(/\s+/g, '<br>')}</div>
            </div>
            <div class="clinic-info">
              <div class="clinic-name">${prescriptionData.hospitalName || prescriptionData.clinicName || 'Hospital'}</div>
              <div class="clinic-details">
                ${prescriptionData.hospitalAddress || prescriptionData.clinicAddress || 'Address not specified'}<br>
                Ph: ${prescriptionData.hospitalPhone || prescriptionData.clinicPhone || 'N/A'}${prescriptionData.workingHours ? `, Timing: ${prescriptionData.workingHours.startTime || '09:00'} AM - ${prescriptionData.workingHours.endTime || '02:00'} PM` : ''}${prescriptionData.workingHours?.closedDays ? `<br>Closed: ${Array.isArray(prescriptionData.workingHours.closedDays) ? prescriptionData.workingHours.closedDays.join(', ') : prescriptionData.workingHours.closedDays}` : ''}
              </div>
              <div class="date-time">
                Date: ${formatDate(prescriptionData.createdAt)}, ${formatTime(prescriptionData.createdAt)}
              </div>
            </div>
          </div>

          <div class="patient-section">
            <div class="barcode">
              <div class="barcode-line" style="width: 60%;"></div>
              <div class="barcode-line" style="width: 80%;"></div>
              <div class="barcode-line" style="width: 40%;"></div>
              <div class="barcode-line" style="width: 90%;"></div>
              <div class="barcode-line" style="width: 50%;"></div>
              <div class="barcode-line" style="width: 70%;"></div>
            </div>
            <div class="patient-details">
              <div class="patient-line">
                <strong>ID:</strong> ${(patient.id || 'N/A')} - ${patient.name || 'Patient Name'} (${(patient.gender || 'M').charAt(0).toUpperCase()})
              </div>
              <div class="patient-line">
                <strong>Address:</strong> ${patient.address || 'N/A'}
              </div>
              <div class="patient-line">
                <strong>Temp (deg):</strong> ${temperature || 'N/A'}, <strong>BP:</strong> ${bloodPressure || 'N/A'} mmHg
              </div>
            </div>
          </div>

          <div class="prescription-body">
            <table class="medicine-table">
              <thead>
                <tr>
                  <th class="medicine-number">#</th>
                  <th class="medicine-name-col">Medicine Name</th>
                  <th class="dosage-col">Dosage</th>
                  <th class="duration-col">Duration</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, index) => {
                  const medicine = item.medicine || {};
                  const medicineName = formatMedicineName(medicine);
                  const dosage = formatDosage(item);
                  const totalQty = calculateTotalQuantity(item);
                  const medicineType = getMedicineType(medicine);
                  const duration = item.duration || 1;
                  return `
                    <tr>
                      <td class="medicine-number">${index + 1})</td>
                      <td class="medicine-name-col">${medicineName}</td>
                      <td class="dosage-col">${dosage}</td>
                      <td class="duration-col">${duration} Days (Tot:${totalQty} ${medicineType})</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          ${(function() {
            // Helper function to escape HTML
            function escapeHtml(text) {
              if (!text) return '';
              const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
              };
              return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
            }
            
            const history = prescriptionData.consultationHistory;
            const hasHistory = history && Array.isArray(history) && history.length > 0;
            
            if (!hasHistory) {
              return '';
            }
            
            // Build history items HTML with proper escaping
            const historyItems = history.map(function(cons) {
              const consultationDate = cons.consultationDate || cons.createdAt || new Date();
              let consDate = '';
              let consTime = '';
              try {
                consDate = formatDate(consultationDate);
                consTime = formatTime(consultationDate);
              } catch (e) {
                const dateObj = new Date(consultationDate);
                consDate = dateObj.toLocaleDateString();
                consTime = dateObj.toLocaleTimeString();
              }
              
              let diagnosisHtml = '';
              if (cons.diagnosis) {
                diagnosisHtml = '<div class="history-diagnosis"><strong>Diagnosis:</strong> ' + escapeHtml(cons.diagnosis) + '</div>';
              }
              
              let notesHtml = '';
              if (cons.notes) {
                // Replace newlines with <br> tags for notes
                const notesText = escapeHtml(cons.notes).replace(/\n/g, '<br>');
                notesHtml = '<div class="history-notes"><strong>Notes:</strong> ' + notesText + '</div>';
              }
              
              let doctorHtml = '';
              if (cons.doctor && cons.doctor.fullName) {
                doctorHtml = '<div class="history-doctor">Dr. ' + escapeHtml(cons.doctor.fullName) + '</div>';
              }
              
              return '<div class="history-item">' +
                '<div class="history-date">' + escapeHtml(consDate) + ' ' + escapeHtml(consTime) + '</div>' +
                diagnosisHtml +
                notesHtml +
                doctorHtml +
                '</div>';
            }).join('');
            
            return '<div class="history-section">' +
              '<div class="history-title">📋 Patient History Notes</div>' +
              historyItems +
              '</div>';
          })()}

          <div class="advice-section">
            <div class="advice-label">Advice Given:</div>
            <div class="advice-list">
              ${prescriptionData.notes ? prescriptionData.notes.split('\n').map(line => `* ${line}`).join('<br>') : '* Follow the dosage as prescribed. Take medication after meals unless otherwise specified.'}
            </div>
          </div>

          ${followUpDate ? `
            <div class="follow-up">
              <strong>Follow Up:</strong> ${formatDate(followUpDate)}
            </div>
          ` : ''}

          <div class="charts-section">
            <div class="charts-title">Charts</div>
            <div class="charts-container">
              <div class="chart">
                <div class="chart-title">Temperature (Deg C)</div>
                <div class="chart-placeholder">
                  Chart data not available
                </div>
              </div>
              <div class="chart">
                <div class="chart-title">Blood Pressure</div>
                <div class="chart-placeholder">
                  Chart data not available
                </div>
              </div>
            </div>
          </div>

          <div class="signature-section">
            <div class="signature-text">Signature</div>
            <div class="signature-name">Dr. ${doctor.fullName || 'Doctor Name'}</div>
            <div class="signature-qual">${doctor.qualifications || 'M.B.B.S., M.D.'}</div>
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

  // Generate prescription summary for email/export
  generatePrescriptionSummary: (prescriptionData) => {
    const summary = {
      prescriptionNumber: prescriptionData.prescriptionNumber,
      patientName: prescriptionData.patient.name,
      doctorName: prescriptionData.doctor.fullName,
      date: new Date(prescriptionData.createdAt).toLocaleDateString(),
      medicines: prescriptionData.items.map(item => ({
        name: item.medicine.name,
        dosage: item.dosage || 'As directed',
        frequency: item.frequency,
        duration: `${item.duration} days`,
        instructions: item.instructions || 'As directed'
      })),
      notes: prescriptionData.notes,
      totalAmount: prescriptionData.totalAmount
    };

    return summary;
  },

  // Generate CSV export
  generateCSV: (prescriptions) => {
    const headers = [
      'Prescription Number',
      'Patient Name',
      'Doctor Name',
      'Date',
      'Status',
      'Total Amount',
      'Medicines Count'
    ];

    const rows = prescriptions.map(prescription => [
      prescription.prescriptionNumber,
      prescription.patient?.name || 'N/A',
      prescription.doctor?.fullName || 'N/A',
      new Date(prescription.createdAt).toLocaleDateString(),
      prescription.status,
      prescription.totalAmount,
      prescription.prescriptionItems?.length || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  },

  // Download CSV file
  downloadCSV: (csvContent, filename = 'prescriptions.csv') => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Generate prescriptions list PDF (export all prescriptions)
  generatePrescriptionsListPDF: (prescriptions, hospitalConfig = {}) => {
    const printWindow = window.open('', '_blank');
    const hasData = prescriptions && prescriptions.length > 0;
    
    // Get hospital config data
    const hospitalName = hospitalConfig.hospitalName || 'Hospital Management System';
    const hospitalLogoUrl = hospitalConfig.logoUrl || '';
    const addressParts = [
      hospitalConfig.address,
      hospitalConfig.city,
      hospitalConfig.state,
      hospitalConfig.postalCode,
      hospitalConfig.country
    ].filter(Boolean);
    const hospitalAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Address not specified';
    const hospitalPhone = hospitalConfig.phone || 'N/A';
    const workingHours = hospitalConfig.workingHours || {};
    
    // Format date like "27-Apr-2020"
    const formatDate = (date) => {
      const d = new Date(date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = String(d.getDate()).padStart(2, '0');
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Format time like "04:37 PM"
    const formatTime = (date) => {
      const d = new Date(date);
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    };
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Prescriptions Export - ${new Date().toLocaleDateString()}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 10mm;
            background: white;
            font-size: 10pt;
            line-height: 1.4;
          }
          .prescription-page {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
          }
          .header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8mm;
            padding-bottom: 5mm;
            border-bottom: 2px solid #000;
          }
          .doctor-info {
            flex: 1;
          }
          .doctor-name {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 2mm;
          }
          .doctor-details {
            font-size: 9pt;
            line-height: 1.6;
          }
          .logo-section {
            flex: 0 0 80px;
            text-align: center;
            margin: 0 10mm;
          }
          .logo {
            width: 60px;
            height: 60px;
            border: 2px solid #000;
            border-radius: 50%;
            margin: 0 auto 2mm;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20pt;
            font-weight: bold;
            overflow: hidden;
            background: white;
          }
          .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 50%;
          }
          .logo-text {
            font-size: 8pt;
            font-weight: bold;
            text-transform: uppercase;
          }
          .clinic-info {
            flex: 1;
            text-align: right;
          }
          .clinic-name {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 2mm;
          }
          .clinic-details {
            font-size: 9pt;
            line-height: 1.6;
          }
          .date-time {
            font-size: 9pt;
            margin-top: 2mm;
            text-align: right;
          }
          .patient-section {
            margin: 5mm 0;
            padding: 3mm 0;
            border-bottom: 1px solid #ccc;
            display: flex;
            align-items: flex-start;
            gap: 5mm;
          }
          .barcode {
            width: 40px;
            height: 60px;
            border: 1px solid #000;
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 2px;
          }
          .barcode-line {
            height: 2px;
            background: #000;
            width: 100%;
          }
          .patient-details {
            flex: 1;
            font-size: 10pt;
            line-height: 1.8;
          }
          .patient-line {
            margin-bottom: 1mm;
          }
          .prescription-body {
            margin: 5mm 0;
            position: relative;
          }
          .medicine-table {
            width: 100%;
            border-collapse: collapse;
            margin-left: 0;
            font-size: 10pt;
          }
          .medicine-table th {
            border-bottom: 2px solid #000;
            padding: 3mm 2mm;
            text-align: left;
            font-weight: bold;
            background: #f9f9f9;
          }
          .medicine-table td {
            padding: 2mm;
            border-bottom: 1px solid #ddd;
            vertical-align: top;
          }
          .medicine-number {
            font-weight: bold;
            width: 30px;
          }
          .medicine-name-col {
            font-weight: bold;
            width: 35%;
          }
          .dosage-col {
            width: 40%;
          }
          .duration-col {
            width: 25%;
          }
          .advice-section {
            margin: 5mm 0;
            padding: 2mm 0;
          }
          .advice-label {
            font-weight: bold;
            font-size: 10pt;
            margin-bottom: 2mm;
          }
          .advice-list {
            font-size: 10pt;
            line-height: 1.6;
          }
          .follow-up {
            margin: 5mm 0;
            font-size: 10pt;
          }
          .charts-section {
            margin: 8mm 0;
          }
          .charts-title {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 3mm;
            text-decoration: underline;
          }
          .charts-container {
            display: flex;
            gap: 5mm;
          }
          .chart {
            flex: 1;
            border: 1px solid #ccc;
            padding: 3mm;
            height: 80mm;
            position: relative;
          }
          .chart-title {
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 2mm;
            text-align: center;
          }
          .chart-placeholder {
            width: 100%;
            height: 60mm;
            border: 1px solid #ddd;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            font-size: 8pt;
          }
          .signature-section {
            margin-top: 10mm;
            text-align: right;
            padding-right: 10mm;
          }
          .signature-text {
            font-style: italic;
            font-size: 10pt;
            margin-bottom: 2mm;
          }
          .signature-name {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 1mm;
          }
          .signature-qual {
            font-size: 9pt;
          }
          .prescriptions-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 12px;
          }
          .prescriptions-table th,
          .prescriptions-table td {
            border: 1px solid #ddd;
            padding: 10px;
            text-align: left;
          }
          .prescriptions-table th {
            background-color: #2563eb;
            color: white;
            font-weight: bold;
            position: sticky;
            top: 0;
          }
          .prescriptions-table tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
          }
          .status-active {
            background-color: #d1fae5;
            color: #065f46;
          }
          .status-dispensed {
            background-color: #dbeafe;
            color: #1e40af;
          }
          .status-cancelled {
            background-color: #fee2e2;
            color: #991b1b;
          }
          .status-expired {
            background-color: #fef3c7;
            color: #92400e;
          }
          .watermark {
            position: absolute;
            opacity: 0.05;
            font-size: 120pt;
            font-weight: bold;
            color: #000;
            z-index: -1;
          }
          .watermark-1 {
            top: 150mm;
            left: 20mm;
            transform: rotate(-45deg);
          }
          .watermark-2 {
            top: 150mm;
            right: 20mm;
            transform: rotate(45deg);
          }
          .export-info {
            margin-bottom: 10mm;
            padding: 3mm;
            background-color: #f3f4f6;
            border-radius: 4px;
            font-size: 9pt;
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
        <div class="prescription-page">
          <div class="watermark watermark-1">+</div>
          <div class="watermark watermark-2">⚕</div>

          ${hasData ? `
            <div class="export-info">
              <strong>Export Date:</strong> ${formatDate(new Date())}, ${formatTime(new Date())}<br>
              <strong>Total Prescriptions:</strong> ${prescriptions.length}
            </div>
          ` : ''}

        ${hasData ? `
          <table class="prescriptions-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Prescription Number</th>
                <th>Patient Name</th>
                <th>Patient Phone</th>
                <th>Doctor Name</th>
                <th>Date</th>
                <th>Status</th>
                <th>Medicines Count</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${prescriptions.map((prescription, index) => {
                const statusClass = prescription.status.toLowerCase().replace(/\s+/g, '-');
                return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${prescription.prescriptionNumber || 'N/A'}</td>
                  <td>${prescription.patient?.name || 'N/A'}</td>
                  <td>${prescription.patient?.phone || 'N/A'}</td>
                  <td>${prescription.doctor?.fullName || 'N/A'}</td>
                  <td>${new Date(prescription.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span class="status-badge status-${statusClass}">
                      ${prescription.status}
                    </span>
                  </td>
                  <td>${prescription.prescriptionItems?.length || 0}</td>
                  <td>$${prescription.totalAmount?.toFixed(2) || '0.00'}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        ` : `
          <div class="header-section">
            <div class="doctor-info">
              <div class="doctor-name">Dr. [Doctor Name]</div>
              <div class="doctor-details">
                M.B.B.S., M.D. | Reg. No: [Registration Number]<br>
                Mob. No: [Mobile Number]
              </div>
            </div>
            <div class="logo-section">
              ${hospitalLogoUrl ? `
                <div class="logo">
                  <img src="${hospitalLogoUrl.startsWith('http') || hospitalLogoUrl.startsWith('data:') ? hospitalLogoUrl : (window.location.origin + (hospitalLogoUrl.startsWith('/') ? '' : '/') + hospitalLogoUrl)}" alt="Hospital Logo" style="width: 100%; height: 100%; object-fit: contain;" />
                </div>
              ` : `
                <div class="logo" style="font-size: 16pt;">${hospitalName.substring(0, 3).toUpperCase()}</div>
              `}
              <div class="logo-text">${hospitalName.toUpperCase().replace(/\s+/g, '<br>')}</div>
            </div>
            <div class="clinic-info">
              <div class="clinic-name">${hospitalName}</div>
              <div class="clinic-details">
                ${hospitalAddress}<br>
                Ph: ${hospitalPhone}${workingHours.startTime ? `, Timing: ${workingHours.startTime} - ${workingHours.endTime}` : ''}${workingHours.closedDays ? `<br>Closed: ${Array.isArray(workingHours.closedDays) ? workingHours.closedDays.join(', ') : workingHours.closedDays}` : ''}
              </div>
              <div class="date-time">
                Date: ${formatDate(new Date())}, ${formatTime(new Date())}
              </div>
            </div>
          </div>

          <div class="patient-section">
            <div class="barcode">
              <div class="barcode-line" style="width: 60%;"></div>
              <div class="barcode-line" style="width: 80%;"></div>
              <div class="barcode-line" style="width: 40%;"></div>
              <div class="barcode-line" style="width: 90%;"></div>
              <div class="barcode-line" style="width: 50%;"></div>
              <div class="barcode-line" style="width: 70%;"></div>
            </div>
            <div class="patient-details">
              <div class="patient-line">
                <strong>ID:</strong> [Patient ID] - [Patient Name] ([Gender])
              </div>
              <div class="patient-line">
                <strong>Address:</strong> [Address]
              </div>
              <div class="patient-line">
                <strong>Temp (deg):</strong> [Temperature], <strong>BP:</strong> [Blood Pressure] mmHg
              </div>
            </div>
          </div>

          <div class="prescription-body">
            <table class="medicine-table">
              <thead>
                <tr>
                  <th class="medicine-number">#</th>
                  <th class="medicine-name-col">Medicine Name</th>
                  <th class="dosage-col">Dosage</th>
                  <th class="duration-col">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="medicine-number">1)</td>
                  <td class="medicine-name-col">&nbsp;</td>
                  <td class="dosage-col">&nbsp;</td>
                  <td class="duration-col">&nbsp;</td>
                </tr>
                <tr>
                  <td class="medicine-number">2)</td>
                  <td class="medicine-name-col">&nbsp;</td>
                  <td class="dosage-col">&nbsp;</td>
                  <td class="duration-col">&nbsp;</td>
                </tr>
                <tr>
                  <td class="medicine-number">3)</td>
                  <td class="medicine-name-col">&nbsp;</td>
                  <td class="dosage-col">&nbsp;</td>
                  <td class="duration-col">&nbsp;</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="advice-section">
            <div class="advice-label">Advice Given:</div>
            <div class="advice-list">
              * Follow the dosage as prescribed. Take medication after meals unless otherwise specified.
            </div>
          </div>

          <div class="charts-section">
            <div class="charts-title">Charts</div>
            <div class="charts-container">
              <div class="chart">
                <div class="chart-title">Temperature (Deg C)</div>
                <div class="chart-placeholder">
                  Chart data not available
                </div>
              </div>
              <div class="chart">
                <div class="chart-title">Blood Pressure</div>
                <div class="chart-placeholder">
                  Chart data not available
                </div>
              </div>
            </div>
          </div>

          <div class="signature-section">
            <div class="signature-text">Signature</div>
            <div class="signature-name">Dr. [Doctor Name]</div>
            <div class="signature-qual">M.B.B.S., M.D.</div>
          </div>
        `}

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
  }
};

export default PrescriptionPDFGenerator;
