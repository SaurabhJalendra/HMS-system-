import React, { useState, useEffect } from 'react';
import labTestService from '../../lib/api/services/labTestService';
import patientService from '../../lib/api/services/patientService';
import userService from '../../lib/api/services/userService';
import InfoButton from '../common/InfoButton';
import { getInfoContent } from '../../lib/infoContent';
import LabTestPDFGenerator from '../../lib/utils/labTestPDFGenerator';
import { useHospitalConfig } from '../../lib/contexts/HospitalConfigContext';
import { formatCurrencySync, getCurrencySymbol } from '../../lib/utils/currencyAndTimezone';
import { autoSelectIfZero, autoSelectIfZeroMouseDown } from '../../lib/utils/numberInput';

const LabTestManagement = ({ user, isAuthenticated, onBack }: any) => {
  const { displayCurrency } = useHospitalConfig();
  const [labTests, setLabTests] = useState([]);
  const [testCatalog, setTestCatalog] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showResultForm, setShowResultForm] = useState(false);
  const [editingLabTest, setEditingLabTest] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState('tests');
  const [stats, setStats] = useState(null);
  const [selectedDoctorForHistory, setSelectedDoctorForHistory] = useState(null);
  const [doctorHistoryTests, setDoctorHistoryTests] = useState([]);
  const [doctorHistoryLoading, setDoctorHistoryLoading] = useState(false);
  const [showTechSelection, setShowTechSelection] = useState(false);
  const [selectedTechTests, setSelectedTechTests] = useState([]);
  const [availableTests, setAvailableTests] = useState([]);
  const [selectedLabType, setSelectedLabType] = useState('General');
  const [mySelectedTests, setMySelectedTests] = useState([]);
  const [mySelectedTestsByType, setMySelectedTestsByType] = useState({});
  const [priceEdits, setPriceEdits] = useState({});
  const [techPriceEdits, setTechPriceEdits] = useState({}); // { [testCatalogId]: price } - prices edited during technician selection
  const [dpSelections, setDpSelections] = useState({}); // { [testCatalogId]: { [pointName]: true } }
  const [_expandedTests, _setExpandedTests] = useState({}); // UI expand/collapse in selection modal

  // Form data
  const [formData, setFormData] = useState({
    patientId: '',
    orderedBy: '',
    testCatalogId: '',
    notes: ''
  });

  // Result form data
  const [resultData, setResultData] = useState({
    results: '',
    notes: '',
    reportFile: ''
  });
  
  // Test details for result entry
  const [testDetailsForResult, setTestDetailsForResult] = useState(null);
  const [resultDataPoints, setResultDataPoints] = useState({});
  const [selectedReportFile, setSelectedReportFile] = useState(null);

  // Helpers to persist datapoint selections per technician+test in localStorage
  const dpStorageKey = (testId) => `tech_dp:${user?.id || 'anon'}:${testId}`;
  const loadDpForTest = (testId) => {
    try { const s = localStorage.getItem(dpStorageKey(testId)); return s ? JSON.parse(s) : {}; } catch { return {}; }
  };
  const saveDpForTest = (testId, map) => {
    try { localStorage.setItem(dpStorageKey(testId), JSON.stringify(map || {})); } catch { /* ignore quota / private mode */ }
  };
  
  // Load/save technician price edits
  const techPriceStorageKey = (technicianId, testId) => `tech_price_${technicianId}_${testId}`;
  const loadTechPriceForTest = (testId) => {
    if (!user?.id) return null;
    try {
      const key = techPriceStorageKey(user.id, testId);
      const s = localStorage.getItem(key);
      return s ? parseFloat(s) : null;
    } catch {
      return null;
    }
  };
  const saveTechPriceForTest = (testId, price) => {
    if (!user?.id) return;
    try {
      const key = techPriceStorageKey(user.id, testId);
      if (price !== null && price !== undefined && !isNaN(price)) {
        localStorage.setItem(key, String(price));
      } else {
        localStorage.removeItem(key);
      }
    } catch { /* ignore quota / private mode */ }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      loadAvailableTests();
      if (user.role === 'LAB_TECH') {
        loadMySelectedTests();
      }
    }
  }, [isAuthenticated, currentPage, filterStatus, searchTerm]);

  // Sync main test checkboxes when modal opens based on saved datapoint selections
  // Also load saved prices for tests
  useEffect(() => {
    if (showTechSelection && availableTests.length > 0) {
      // Sync checkboxes based on datapoint selections
      setSelectedTechTests(prev => {
        const testsToAutoCheck = availableTests.filter(test => {
          if (!test.referenceRange) return false;
          const allPts = parseReferenceRange(test.referenceRange);
          const datapointNames = allPts.filter(p => p.type !== 'section').map(p => p.name);
          if (datapointNames.length === 0) return false;
          
          const saved = loadDpForTest(test.id);
          const selectedCount = datapointNames.filter(name => saved[name]).length;
          return selectedCount > 0 && !prev.includes(test.id);
        });
        
        if (testsToAutoCheck.length > 0) {
          const newIds = testsToAutoCheck.map(t => t.id);
          return [...prev, ...newIds];
        }
        return prev;
      });
      
      // Load saved prices for all available tests
      const loadedPrices = {};
      availableTests.forEach(test => {
        const savedPrice = loadTechPriceForTest(test.id);
        if (savedPrice !== null && !isNaN(savedPrice) && savedPrice >= 0) {
          loadedPrices[test.id] = savedPrice;
        }
      });
      if (Object.keys(loadedPrices).length > 0) {
        setTechPriceEdits(prev => ({ ...prev, ...loadedPrices }));
      }
    }
  }, [showTechSelection, availableTests.length]); // Only run when modal opens or tests load

  const loadData = async () => {
    try {
      setLoading(true);
      const [labTestsRes, catalogRes, patientsRes, doctorsRes] = await Promise.all([
        labTestService.getLabTests({ 
          page: currentPage, 
          limit: 20,
          status: filterStatus || undefined,
          search: searchTerm || undefined
        }),
        labTestService.getTestCatalog(),
        patientService.getPatients({ page: 1, limit: 1000 }),
        userService.getUsers({ role: 'DOCTOR', page: 1, limit: 1000 })
      ]);

      // Handle lab tests - services return data directly, not wrapped in success
      if (labTestsRes) {
        const labTests = labTestsRes.labTests || labTestsRes.data?.labTests || [];
        const pagination = labTestsRes.pagination || labTestsRes.data?.pagination || { totalPages: 1 };
        setLabTests(labTests);
        setTotalPages(pagination.totalPages || 1);
        console.log('Loaded lab tests:', labTests.length);
      }

      // Handle catalog
      if (catalogRes) {
        const catalog = catalogRes.testCatalog || catalogRes.data?.testCatalog || [];
        setTestCatalog(catalog);
        console.log('Loaded catalog tests:', catalog.length);
      }

      // Handle patients
      if (patientsRes) {
        const patientList = patientsRes.patients || patientsRes.data?.patients || [];
        setPatients(patientList);
        console.log('Loaded patients:', patientList.length);
      }

      // Handle doctors
      if (doctorsRes) {
        const doctorList = doctorsRes.users || doctorsRes.data?.users || [];
        setDoctors(doctorList);
        console.log('Loaded doctors:', doctorList.length);
      }

      // Load stats fresh
      try {
        const statsRes = await labTestService.getLabTestStats();
        if (statsRes) {
          setStats(statsRes.data || statsRes);
        }
      } catch (err) {
        console.error('Error loading stats:', err);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadDoctorHistory = async (doctorId) => {
    setDoctorHistoryLoading(true);
    setDoctorHistoryTests([]);
    try {
      const res = await labTestService.getLabTestsByDoctor(doctorId);
      setDoctorHistoryTests(res?.labTests || []);
    } catch (e) {
      console.error('Error loading doctor history:', e);
      setDoctorHistoryTests([]);
    } finally {
      setDoctorHistoryLoading(false);
    }
  };

  const loadAvailableTests = async () => {
    try {
      const response = await labTestService.getAvailableTestsForTechnician();
      // Service now returns data directly, not wrapped in ApiResponse
      if (response && response.tests) {
        setAvailableTests(response.tests || []);
      } else if (response && response.data && response.data.tests) {
        // Fallback for old response format
        setAvailableTests(response.data.tests || []);
      } else {
        setAvailableTests([]);
      }
    } catch (error) {
      console.error('Error loading available tests:', error);
      setError(error.response?.data?.message || 'Failed to load available tests');
    }
  };

  const loadMySelectedTests = async () => {
    try {
      const response = await labTestService.getTechnicianSelectedTests(user.id);
      // Service now returns data directly: { selections, testsByLabType, labTypes }
      const selections = response?.selections || [];
      const testIds = selections.map(s => s.testCatalog?.id || s.testCatalogId).filter(Boolean);
      setMySelectedTests(testIds);
      
      // Group by lab type
      const byType = {};
      selections.forEach(selection => {
        const labType = selection.labType || 'General';
        if (!byType[labType]) {
          byType[labType] = [];
        }
        if (selection.testCatalog) {
          byType[labType].push(selection.testCatalog);
        }
      });
      setMySelectedTestsByType(byType);
    } catch (error) {
      console.error('Error loading my selected tests:', error);
    }
  };

  const handleTechSelectionSubmit = async (e) => {
    e.preventDefault();
    
    // Validate inputs - comprehensive checks
    if (!user || !user.id) {
      setError('User information not available. Please log in again.');
      return;
    }

    if (!selectedLabType || typeof selectedLabType !== 'string' || selectedLabType.trim() === '') {
      setError('Please select a valid lab type.');
      return;
    }

    // Validate lab type is one of the allowed values
    const validLabTypes = ['ALL TESTS', 'General', 'MRI', 'CT Scan', 'X-Ray', 'Ultrasound', 'Pathology'];
    if (!validLabTypes.includes(selectedLabType)) {
      setError(`Invalid lab type. Must be one of: ${validLabTypes.join(', ')}`);
      return;
    }
    
    // If "ALL TESTS" is selected, handle it specially
    if (selectedLabType === 'ALL TESTS') {
      setError('Please select a specific lab type to assign tests. Use "ALL TESTS" only for viewing.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(''); // Clear previous errors

      // Ensure testCatalogIds is always an array of valid strings
      let testCatalogIds = [];
      if (Array.isArray(selectedTechTests)) {
        testCatalogIds = selectedTechTests
          .filter(id => id != null && String(id).trim().length > 0)
          .map(id => String(id).trim());
      } else if (selectedTechTests != null) {
        // Handle single value case
        const id = String(selectedTechTests).trim();
        if (id.length > 0) {
          testCatalogIds = [id];
        }
      }

      // Prepare request payload with strict type checking
      const requestPayload = {
        technicianId: String(user.id).trim(),
        testCatalogIds: testCatalogIds,
        labType: String(selectedLabType).trim()
      };

      // Final validation before sending
      if (!requestPayload.technicianId) {
        setError('Invalid technician ID. Please log in again.');
        setLoading(false);
        return;
      }

      if (!requestPayload.labType || !validLabTypes.includes(requestPayload.labType)) {
        setError('Invalid lab type selected.');
        setLoading(false);
        return;
      }

      console.log('Submitting technician test selections:', {
        technicianId: requestPayload.technicianId ? 'provided' : 'missing',
        testCatalogIdsCount: requestPayload.testCatalogIds.length,
        labType: requestPayload.labType
      });

      const response = await labTestService.setTechnicianTestSelections(requestPayload);

      // Service now returns data directly: { selections }
      // If response exists and has selections, consider it successful
      if (response && (response.selections !== undefined || response.data?.selections !== undefined)) {
        // Success case - response contains data (selections)
        setError('');
        setShowTechSelection(false);
        setSelectedTechTests([]);
        setSelectedLabType('General');
        setTechPriceEdits({}); // Clear price edits after successful submission
        
        // Reload data to reflect changes
        try {
          await Promise.all([
            loadAvailableTests(),
            user.role === 'LAB_TECH' ? loadMySelectedTests() : Promise.resolve()
          ]);
        } catch (reloadError) {
          console.error('Error reloading data after update:', reloadError);
          // Don't fail the operation if reload fails
        }
      } else {
        // Failure case - extract error message
        let errorMsg = 'Failed to update test selections';
        if (response?.message) {
          errorMsg = response.message;
        } else if (response?.error) {
          errorMsg = response.error;
        } else if (response?.errors && Array.isArray(response.errors)) {
          errorMsg = response.errors
            .map(e => typeof e === 'string' ? e : (e.message || e.field || 'Invalid input'))
            .join(', ');
        }
        setError(errorMsg);
      }
    } catch (error) {
      console.error('Error submitting technician selections:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code
      });

      // Extract detailed error message with better handling
      let errorMessage = 'Failed to update test selections. Please try again.';
      
      if (error.response?.data) {
        const data = error.response.data;
        
        // Handle validation errors
        if (data.errors && Array.isArray(data.errors)) {
          errorMessage = data.errors
            .map(e => {
              if (typeof e === 'string') return e;
              if (e.message) return `${e.field || 'Field'}: ${e.message}`;
              return 'Invalid input';
            })
            .join('; ') || data.message || errorMessage;
        }
        // Handle error message
        else if (data.message) {
          errorMessage = data.message;
        }
        // Handle error field
        else if (data.error) {
          errorMessage = typeof data.error === 'string' ? data.error : String(data.error);
        }
      } 
      // Handle network errors
      else if (error.message) {
        if (error.message.includes('Network Error') || error.code === 'ERR_NETWORK') {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Cannot connect to server. Please ensure the backend is running.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      if (editingLabTest) {
        const response = await labTestService.updateLabTest(editingLabTest.id, formData);
        if (response && (response.success !== false)) {
          setError('');
          setShowAddForm(false);
          setEditingLabTest(null);
          resetForm();
          loadData();
        } else {
          setError(response?.message || 'Failed to update lab test');
        }
      } else {
        const response = await labTestService.createLabTest(formData);
        if (response && (response.success !== false)) {
          setError('');
          setShowAddForm(false);
          resetForm();
          loadData();
        } else {
          setError(response?.message || 'Failed to create lab test');
        }
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      
      // Handle authentication errors - prevent automatic reload for better UX
      if (error.response?.status === 401) {
        const errorMessage = error.response?.data?.message || 'Authentication failed';
        setError(`${errorMessage}. Please refresh the page and login again.`);
        // Clear tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        // Don't auto-reload immediately, let user see the error
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else if (error.response?.status === 403) {
        const errorMessage = error.response?.data?.message || 'Insufficient permissions';
        setError(`${errorMessage}. Your role (${user?.role}) does not have permission to perform this action. Please contact your administrator.`);
      } else {
        setError(error.response?.data?.message || error.message || 'Failed to submit form. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResultSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      // Format results from data points if available
      let formattedResults = resultData.results;
      if (testDetailsForResult?.referenceRange) {
        const dataPoints = parseReferenceRange(testDetailsForResult.referenceRange);
        if (dataPoints.length > 0 && Object.keys(resultDataPoints).length > 0) {
          // Use structured data points
          formattedResults = dataPoints.map(point => {
            const value = resultDataPoints[point.name] || '';
            return value ? `${point.name}: ${value} ${point.unit ? point.unit : ''}`.trim() : null;
          }).filter(Boolean).join('\n');
          
          if (!formattedResults && !resultData.results.trim()) {
            setError('Please enter at least one test result value');
            setLoading(false);
            return;
          }
          
          // Add general results if provided
          if (resultData.results.trim()) {
            formattedResults += (formattedResults ? '\n\nAdditional Notes:\n' : '') + resultData.results;
          }
        } else {
          // Fallback to text results
          formattedResults = resultData.results;
        }
      }
      
      // Check if test category requires report file upload (MRI, CT Scan, X-Ray)
      const testCategory = testDetailsForResult?.category || editingLabTest?.testCatalog?.category;
      const requiresReportFile = testCategory === 'MRI' || testCategory === 'CT Scan' || testCategory === 'X-Ray';
      
      // Upload report file if selected (for MRI, CT Scan, X-Ray)
      if (selectedReportFile && requiresReportFile) {
        try {
          await labTestService.uploadLabTestReport(editingLabTest.id, selectedReportFile);
        } catch (uploadError) {
          console.error('Error uploading report file:', uploadError);
          setError('Failed to upload report file. Please try again.');
          setLoading(false);
          return;
        }
      } else if (requiresReportFile && !selectedReportFile && !editingLabTest?.reportFile) {
        setError('Report file upload is required for ' + testCategory + ' tests.');
        setLoading(false);
        return;
      }

      const updateData = {
        results: formattedResults,
        notes: resultData.notes,
        reportFile: resultData.reportFile || editingLabTest?.reportFile || '',
        status: 'COMPLETED',
        performedBy: user.id
      };

      const response = await labTestService.updateLabTest(editingLabTest.id, updateData);
      if (response && (response.success !== false)) {
        setError('');
        setShowResultForm(false);
        setEditingLabTest(null);
        resetResultForm();
        loadData();
      } else {
        setError(response?.message || 'Failed to update lab test results');
      }
    } catch (error) {
      console.error('Error submitting results:', error);
      setError('Failed to submit results');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (labTest) => {
    setEditingLabTest(labTest);
    setFormData({
      patientId: labTest.patientId,
      orderedBy: labTest.orderedBy,
      testCatalogId: labTest.testCatalogId,
      notes: labTest.notes || ''
    });
    setShowAddForm(true);
  };

  const handleCancelTest = async (labTest) => {
    if (labTest.status === 'COMPLETED' || labTest.status === 'CANCELLED') {
      return;
    }
    const testName = labTest.testNameSnapshot || labTest.testCatalog?.testName || 'this test';
    const patientName = labTest.patient?.name || patients.find(p => p.id === labTest.patientId)?.name || 'this patient';
    const confirmed = window.confirm(
      `Cancel the ordered test "${testName}" for ${patientName}? Use this when the hospital cannot perform the test.`
    );
    if (!confirmed) {
      return;
    }
    try {
      setLoading(true);
      setError('');
      await labTestService.cancelLabTest(labTest.id, 'Cancelled: hospital cannot perform this test');
      await loadData();
    } catch (err) {
      console.error('Error cancelling lab test:', err);
      setError(err.response?.data?.message || 'Failed to cancel lab test');
    } finally {
      setLoading(false);
    }
  };

  // Parse reference range to extract data points
  const parseReferenceRange = (referenceRange) => {
    if (!referenceRange) return [];
    
    const points = [];
    // Support both pipe-delimited (new format) and comma-delimited (old format)
    const delimiter = referenceRange.includes('|') ? '|' : ',';
    const parts = referenceRange.split(delimiter).map(p => p.trim());
    
    parts.forEach(part => {
      // Support section headers like "BLOOD INDICES:" (no value after colon)
      const headerOnly = part.match(/^([A-Za-z0-9()\s/-]+):\s*$/);
      if (headerOnly) {
        points.push({ type: 'section', name: headerOnly[1].trim() });
        return;
      }

      // Match patterns: "Name: range unit" or "Name: range" or "Name: value"
      const match = part.match(/^([^:]+):\s*(.+)$/);
      if (!match) return;

      const name = match[1].trim();
      const rangeUnit = match[2].trim();
      
      // Extract unit if present (extended common units)
      const unitMatch = rangeUnit.match(/(.+?)\s*(g\/dL|mg\/dL|U\/L|μL|cumm|mill\/cumm|%|ng\/mL|pg\/mL|mm\/hr|mg\/L|L|Images|N\/A|fL|pg|mIU\/L|IU\/L|mmol\/L|g\/L|10\^3\/μL|10\^6\/μL|cells\/μL|mEq\/L)?$/);
      const value = unitMatch ? (unitMatch[1] || '').trim() : rangeUnit;
      const unit = unitMatch && unitMatch[2] ? unitMatch[2] : '';
      
      // Parse min/max from range (e.g., "13.0-17.0" or "<5.7" or "00-06")
      let minValue = null;
      let maxValue = null;
      
      if (/^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?$/.test(value)) {
        const rangeParts = value.split('-').map(p => parseFloat(p.trim()));
        if (rangeParts.length === 2 && !isNaN(rangeParts[0]) && !isNaN(rangeParts[1])) {
          minValue = rangeParts[0];
          maxValue = rangeParts[1];
        }
      } else if (value.startsWith('<')) {
        const n = parseFloat(value.substring(1));
        if (!isNaN(n)) maxValue = n;
      } else if (value.startsWith('>')) {
        const n = parseFloat(value.substring(1));
        if (!isNaN(n)) minValue = n;
      }
      
      points.push({
        type: 'point',
        name,
        referenceRange: value,
        minValue,
        maxValue,
        unit,
        value: ''
      });
    });
    
    return points.length > 0 ? points : [{ type: 'point', name: 'Result', referenceRange: referenceRange, unit: '', value: '', minValue: null, maxValue: null }];
  };

  // Calculate status based on value and reference range
  const calculateStatus = (value, minValue, maxValue, referenceRange) => {
    if (!value || value.trim() === '') return null;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return null;
    
    // Handle special cases like "Primary Sample Type"
    if (referenceRange && !referenceRange.includes('-') && !referenceRange.includes('<') && !referenceRange.includes('>')) {
      return null; // No status for non-numeric ranges
    }
    
    if (minValue !== null && maxValue !== null) {
      if (numValue < minValue) return 'Low';
      if (numValue > maxValue) return 'High';
      // Check if borderline (within 5% of limits)
      const range = maxValue - minValue;
      if (numValue <= minValue + (range * 0.05) || numValue >= maxValue - (range * 0.05)) {
        return 'Borderline';
      }
      return 'Normal';
    } else if (maxValue !== null && numValue > maxValue) {
      return 'High';
    } else if (minValue !== null && numValue < minValue) {
      return 'Low';
    }
    
    return 'Normal';
  };

  const handleResultEntry = async (labTest) => {
    setEditingLabTest(labTest);
    
    // Load test catalog details - prefer from labTest relation, fallback to catalog array
    let testCatalogItem = null;
    if (labTest.testCatalog) {
      testCatalogItem = labTest.testCatalog;
    } else if (labTest.testCatalogId) {
      testCatalogItem = testCatalog.find(t => t.id === labTest.testCatalogId);
    }
    
    setTestDetailsForResult(testCatalogItem);
    
    // Parse reference range if available
    let dataPoints = testCatalogItem?.referenceRange
      ? parseReferenceRange(testCatalogItem.referenceRange)
      : [];

    // Filter out "result" from datapoints (it's not a datapoint, it's a required action)
    dataPoints = dataPoints.filter(p => {
      if (p.type === 'section') return true; // Keep section headers
      // Remove "result" (case-insensitive)
      return !p.name || p.name.toLowerCase() !== 'result';
    });

    // Apply technician datapoint selection filter if exists
    try {
      const dpMap = loadDpForTest(testCatalogItem?.id || labTest.testCatalogId);
      if (dpMap && Object.keys(dpMap).length > 0) {
        dataPoints = dataPoints.filter(p => p.type === 'section' || dpMap[p.name]);
      }
    } catch { /* ignore localStorage parse errors */ }
    
    // Initialize data points from existing results if available
    const existingPoints = {};
    if (labTest.results && dataPoints.length > 0) {
      // Try to parse existing results
      const lines = labTest.results.split('\n');
      dataPoints.forEach(point => {
        const line = lines.find(l => l.includes(point.name));
        if (line) {
          const match = line.match(/:\s*(.+)/);
          existingPoints[point.name] = match ? match[1].trim() : '';
        }
      });
    }
    
    setResultDataPoints(dataPoints.length > 0 ? existingPoints : {});
    
    setResultData({
      results: labTest.results || '',
      notes: labTest.notes || '',
      reportFile: labTest.reportFile || ''
    });
    setShowResultForm(true);
  };

  const resetForm = () => {
    setFormData({
      patientId: '',
      orderedBy: '',
      testCatalogId: '',
      notes: ''
    });
    setEditingLabTest(null);
  };

  const resetResultForm = () => {
    setResultData({
      results: '',
      notes: '',
      reportFile: ''
    });
    setResultDataPoints({});
    setTestDetailsForResult(null);
    setEditingLabTest(null);
    setSelectedReportFile(null);
  };

  const handleViewResults = async (labTest) => {
    setEditingLabTest(labTest);
    setShowResultForm(true);
    
    // Load test catalog details
    let testCatalogItem = null;
    if (labTest.testCatalog) {
      testCatalogItem = labTest.testCatalog;
    } else if (labTest.testCatalogId) {
      testCatalogItem = testCatalog.find(t => t.id === labTest.testCatalogId);
    }
    
    setTestDetailsForResult(testCatalogItem);
    
    // Parse existing results to populate data points
    let dataPoints = testCatalogItem?.referenceRange 
      ? parseReferenceRange(testCatalogItem.referenceRange)
      : [];
    
    // Filter out "result" from datapoints (it's not a datapoint, it's a required action)
    dataPoints = dataPoints.filter(p => {
      if (p.type === 'section') return true; // Keep section headers
      // Remove "result" (case-insensitive)
      return !p.name || p.name.toLowerCase() !== 'result';
    });
    
    const existingPoints = {};
    if (labTest.results && dataPoints.length > 0) {
      const lines = labTest.results.split('\n');
      dataPoints.forEach(point => {
        const line = lines.find(l => l.includes(point.name));
        if (line) {
          // Parse value from line like "Hemoglobin: 12.5 g/dL"
          const match = line.match(/:\s*(.+?)(?:\s+\w+)?$/);
          existingPoints[point.name] = match ? match[1].trim() : '';
        }
      });
    }
    
    setResultDataPoints(existingPoints);
    setResultData({
      results: labTest.results || '',
      notes: labTest.notes || '',
      reportFile: labTest.reportFile || ''
    });
  };

  const renderTabs = () => {
    const tabs = [
      { id: 'tests', label: 'Lab Tests', icon: '🧪' },
      { id: 'catalog', label: 'Test Catalog', icon: '📋' },
      ...(user.role === 'LAB_TECH' ? [{ id: 'myTests', label: 'My Tests', icon: '👤' }] : []),
      { id: 'stats', label: 'Statistics', icon: '📊' }
    ];

    return React.createElement(
      'div',
      { style: { display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: '24px' } },
      tabs.map(tab => 
        React.createElement(
          'button',
          {
            key: tab.id,
            onClick: () => setActiveTab(tab.id),
            style: {
              padding: '8px 16px',
              fontWeight: '500',
              fontSize: '14px',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? '#3B82F6' : 'transparent'}`,
              color: activeTab === tab.id ? '#2563EB' : '#6B7280',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }
          },
          `${tab.icon} ${tab.label}`
        )
      )
    );
  };

  const renderLabTestsTab = () => {
    return React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '8px 12px', marginBottom: '8px' } },
      // Search and filters
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '8px', backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '6px 8px' } },
        React.createElement(
          'input',
          {
            type: 'text',
            placeholder: 'Search lab tests...',
            value: searchTerm,
            onChange: (e) => setSearchTerm(e.target.value),
            style: { padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
          }
        ),
        React.createElement(
          'select',
          {
            value: filterStatus,
            onChange: (e) => setFilterStatus(e.target.value),
            style: { padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
          },
          React.createElement('option', { value: '' }, 'All Statuses'),
          React.createElement('option', { value: 'PENDING' }, 'Pending'),
          user.role !== 'LAB_TECH' && React.createElement('option', { value: 'IN_PROGRESS' }, 'In Progress'),
          React.createElement('option', { value: 'COMPLETED' }, 'Completed'),
          React.createElement('option', { value: 'CANCELLED' }, 'Cancelled')
        ),
        React.createElement('div', null), // Empty div for spacing
        React.createElement(
          'button',
          {
            onClick: loadData,
            style: {
              backgroundColor: '#6C757D',
              color: '#FFFFFF',
              border: '1px solid #5A6268',
              padding: '4px 12px',
              borderRadius: '2px',
              fontSize: '13px',
              fontWeight: '400',
              cursor: 'pointer',
              boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
            },
            onMouseOver: (e) => {
              e.target.style.backgroundColor = '#5A6268';
            },
            onMouseOut: (e) => {
              e.target.style.backgroundColor = '#6C757D';
            }
          },
          'Search'
        )
      ),
      // Lab Tests Table
      React.createElement(
        'div',
        { className: 'overflow-x-auto' },
        React.createElement(
          'table',
          { className: 'min-w-full divide-y divide-gray-200' },
          React.createElement(
            'thead',
            { className: 'bg-gray-50' },
            React.createElement(
              'tr',
              null,
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Patient'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Test'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Ordered By'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Status'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Date'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Actions')
            )
          ),
          React.createElement(
            'tbody',
            { className: 'bg-white divide-y divide-gray-200' },
            labTests.length === 0 ? React.createElement(
              'tr',
              null,
              React.createElement(
                'td',
                { colSpan: 6, className: 'px-6 py-4 text-center text-gray-500' },
                loading ? 'Loading...' : 'No lab tests found. Click "Order Lab Test" to create your first test order.'
              )
            ) : labTests.map(test => 
              React.createElement(
                'tr',
                { key: test.id, className: 'hover:bg-gray-50' },
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' },
                  test.patient?.name || patients.find(p => p.id === test.patientId)?.name || 'Unknown'
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  test.testNameSnapshot || test.testCatalog?.testName || 'Unknown'
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  test.orderedByUser?.fullName || 'Unknown'
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap' },
                  React.createElement(
                    'span',
                    {
                      className: `px-2 py-1 text-xs font-semibold rounded-full ${
                        test.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        test.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                        test.status === 'PENDING' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`
                    },
                    test.status
                  )
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  new Date(test.createdAt).toLocaleDateString()
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium' },
                  React.createElement(
                    'div',
                    { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                    user.role !== 'LAB_TECH' && React.createElement(
                      'button',
                      {
                        onClick: () => handleEdit(test),
                        className: 'text-blue-600 hover:text-blue-900 cursor-pointer'
                      },
                      'Edit'
                    ),
                    (test.status === 'PENDING' || test.status === 'IN_PROGRESS') && (user.role === 'LAB_TECH' || user.role === 'ADMIN') && React.createElement(
                      'button',
                      {
                        onClick: () => handleResultEntry(test),
                        className: 'text-green-600 hover:text-green-900 cursor-pointer'
                      },
                      test.status === 'COMPLETED' ? 'View Results' : 'Enter Results'
                    ),
                    (test.status === 'PENDING' || test.status === 'IN_PROGRESS') && (user.role === 'LAB_TECH' || user.role === 'ADMIN') && React.createElement(
                      'button',
                      {
                        onClick: () => handleCancelTest(test),
                        className: 'text-red-600 hover:text-red-900 cursor-pointer'
                      },
                      'Cancel'
                    ),
                    test.status === 'COMPLETED' && test.results && React.createElement(
                      'button',
                      {
                        onClick: () => handleViewResults(test),
                        className: 'text-blue-600 hover:text-blue-900 cursor-pointer'
                      },
                      'View Results'
                    )
                  )
                )
              )
            )
          )
        )
      ),
      // Pagination
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'center', marginTop: '24px' } },
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          React.createElement(
            'button',
            {
              onClick: () => setCurrentPage(Math.max(1, currentPage - 1)),
              disabled: currentPage === 1,
              style: {
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                backgroundColor: '#FFFFFF',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1
              }
            },
            'Previous'
          ),
          React.createElement(
            'span',
            { style: { padding: '8px' } },
            `Page ${currentPage} of ${totalPages}`
          ),
          React.createElement(
            'button',
            {
              onClick: () => setCurrentPage(Math.min(totalPages, currentPage + 1)),
              disabled: currentPage === totalPages,
              style: {
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                backgroundColor: '#FFFFFF',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1
              }
            },
            'Next'
          )
        )
      )
    );
  };

  const renderCatalogTab = () => {
    // Filter tests based on user role
    // For lab technicians: show only assigned tests
    // For admins: show all tests
    const displayTests = user.role === 'LAB_TECH' 
      ? testCatalog.filter(test => mySelectedTests.includes(test.id))
      : testCatalog;
    
    const testCount = displayTests.length;
    const totalCount = testCatalog.length;
    
    return React.createElement(
      'div',
      null,
      React.createElement(
        'h3',
        { style: { fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#111827' } },
        `Test Catalog ${testCount > 0 ? `(${testCount} ${user.role === 'LAB_TECH' ? 'assigned' : ''} test${testCount !== 1 ? 's' : ''}${user.role === 'LAB_TECH' && totalCount > testCount ? ` of ${totalCount} total` : ''})` : ''}`
      ),
      user.role === 'LAB_TECH' && testCount === 0 && totalCount > 0 && React.createElement(
        'div',
        { style: { padding: '16px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', marginBottom: '16px', color: '#92400E' } },
        React.createElement('strong', null, 'No tests assigned. '),
        'Please contact an administrator to assign tests to you, or use the "Select My Tests" button in the "My Tests" tab.'
      ),
      loading && testCatalog.length === 0 ? 
        React.createElement(
          'div',
          { style: { padding: '48px', textAlign: 'center', color: '#6B7280' } },
          'Loading catalog...'
        ) :
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' } },
        !Array.isArray(displayTests) || displayTests.length === 0 ? 
          React.createElement(
            'div',
            { style: { padding: '48px', textAlign: 'center', color: '#6B7280' } },
            user.role === 'LAB_TECH' 
              ? 'No tests assigned to you. Please contact an administrator to assign tests.'
              : 'No tests available in catalog. Please check if the database is seeded.'
          ) :
          displayTests.map(test => 
            React.createElement(
              'div',
              { 
                key: test.id, 
                style: { 
                  backgroundColor: '#FFFFFF', 
                  padding: '8px 12px', 
                  borderRadius: '2px', 
                  border: '1px solid #C8C8C8',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                } 
              },
              React.createElement(
                'h4',
                { style: { fontWeight: '600', color: '#111827', margin: 0 } },
                test.testName
              ),
              test.description && React.createElement(
                'p',
                { style: { fontSize: '14px', color: '#6B7280', margin: 0 } },
                test.description
              ),
              React.createElement(
                'div',
                { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } },
                test.category && React.createElement(
                  'span',
                  { style: { 
                    backgroundColor: '#DBEAFE', 
                    color: '#1E40AF', 
                    fontSize: '12px', 
                    padding: '4px 8px', 
                    borderRadius: '4px' 
                  } },
                  test.category
                ),
                (user.role === 'ADMIN' ?
                  React.createElement(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('input', {
                      type: 'number',
                      min: 0,
                      step: '0.01',
                      value: priceEdits[test.id] !== undefined ? priceEdits[test.id] : (test.price || 0),
                      onChange: (e) => setPriceEdits({ ...priceEdits, [test.id]: e.target.value }),
                      onFocus: autoSelectIfZero,
                      onMouseDown: autoSelectIfZeroMouseDown,
                      style: {
                        width: '120px',
                        padding: '6px 10px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }
                    }),
                    React.createElement('button', {
                      onClick: async () => {
                        try {
                          const newPrice = parseFloat(priceEdits[test.id] ?? test.price);
                          if (isNaN(newPrice) || newPrice < 0) return;
                          await labTestService.updateTestCatalogItem(test.id, { price: newPrice });
                          setTestCatalog(testCatalog.map(t => t.id === test.id ? { ...t, price: newPrice } : t));
                        } catch (err) {
                          console.error('Failed to update price', err);
                          setError('Failed to update price');
                        }
                      },
                      style: {
                        padding: '6px 10px',
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }
                    }, 'Save')
                  ) :
                  React.createElement(
                    'span',
                    { style: { 
                      backgroundColor: '#F3F4F6', 
                      color: '#374151', 
                      fontSize: '12px', 
                      padding: '4px 8px', 
                      borderRadius: '4px' 
                    } },
                    formatCurrencySync(test.price || 0, displayCurrency || 'USD')
                  )
                ),
                test.units && React.createElement(
                  'span',
                  { style: { 
                    backgroundColor: '#FEF3C7', 
                    color: '#92400E', 
                    fontSize: '12px', 
                    padding: '4px 8px', 
                    borderRadius: '4px' 
                  } },
                  test.units
                )
              )
            )
          )
      )
    );
  };

  const handleOpenTechSelection = () => {
    // Choose a default lab type based on existing groups
    const labTypes = Object.keys(mySelectedTestsByType);
    const initialLabType = labTypes.length > 0 ? labTypes[0] : 'General';
    setSelectedLabType(initialLabType);
    // Pre-populate only IDs from that lab type to avoid cross-type mixing
    const testsForType = mySelectedTestsByType[initialLabType] || [];
    setSelectedTechTests(testsForType.map(t => t.id));
    
    // Load saved prices for all available tests
    const loadedPrices = {};
    availableTests.forEach(test => {
      const savedPrice = loadTechPriceForTest(test.id);
      if (savedPrice !== null && !isNaN(savedPrice)) {
        loadedPrices[test.id] = savedPrice;
      }
    });
    if (Object.keys(loadedPrices).length > 0) {
      setTechPriceEdits(loadedPrices);
    }
    
    setShowTechSelection(true);
    // The useEffect will handle syncing main checkboxes based on saved datapoint selections
  };

  const _handleClearAllTests = async () => {
    if (!window.confirm('Are you sure you want to clear all your selected tests? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Validate user exists
      if (!user || !user.id) {
        setError('User information not available. Please log in again.');
        setLoading(false);
        return;
      }

      // Get all lab types that have selections
      const labTypes = Object.keys(mySelectedTestsByType);
      
      // Use 'General' as default lab type - the backend will clear ALL selections
      // for this technician regardless of lab type when testCatalogIds is empty
      const labTypeToUse = labTypes.length > 0 ? labTypes[0] : 'General';

      // Prepare request payload
      const requestPayload = {
        technicianId: String(user.id),
        testCatalogIds: [],
        labType: String(labTypeToUse)
      };

      console.log('Clearing all tests with payload:', requestPayload);

      // Send a single request - backend clears ALL selections for this technician
      const response = await labTestService.setTechnicianTestSelections(requestPayload);
      
      if (response && (response.success !== false)) {
        setError('');
        // Reload the selected tests to reflect the changes
        await loadMySelectedTests();
      } else {
        setError(response?.message || 'Failed to clear all tests');
      }
    } catch (error) {
      console.error('Error clearing all tests:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Extract detailed error message
      let errorMessage = 'Failed to clear all tests';
      if (error.response?.data) {
        if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.errors && Array.isArray(error.response.data.errors)) {
          errorMessage = error.response.data.errors.map(e => e.message || e.path?.join('.')).join(', ');
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderMyTestsTab = () => {
    const totalSelectedTests = mySelectedTests.length;
    
    return React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
        React.createElement(
          'h3',
          { style: { fontSize: '16px', fontWeight: '600', color: '#000000' } },
          'My Selected Tests'
        ),
        React.createElement(
          'button',
          {
            onClick: handleOpenTechSelection,
            disabled: loading,
            style: {
              backgroundColor: '#0078D4',
              color: '#FFFFFF',
              padding: '4px 12px',
              borderRadius: '2px',
              border: '1px solid #005A9E',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: '400',
              opacity: loading ? 0.6 : 1,
              boxShadow: loading ? 'none' : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
            }
          },
          totalSelectedTests > 0 ? 'Update My Tests' : 'Select My Tests'
        )
      ),
      React.createElement(
        'p',
        { style: { color: '#6B7280', marginBottom: '16px' } },
        totalSelectedTests > 0 
          ? `You have ${totalSelectedTests} test${totalSelectedTests > 1 ? 's' : ''} selected. You can update your selections anytime by clicking "Update My Tests".`
          : 'Select which tests you can perform in your laboratory. You can update your selections anytime.'
      ),
      totalSelectedTests > 0 ? (
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
          Object.entries(mySelectedTestsByType).map(([labType, tests]) => 
            React.createElement(
              'div',
              { key: labType, style: { backgroundColor: '#FFFFFF', borderRadius: '2px', border: '1px solid #C8C8C8', padding: '8px 12px' } },
              React.createElement(
                'h4',
                { style: { fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '12px' } },
                `${labType} Laboratory (${tests.length} test${tests.length > 1 ? 's' : ''})`
              ),
              React.createElement(
                'div',
                { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' } },
                tests.map(test => 
                  React.createElement(
                    'div',
                    { 
                      key: test.id, 
                      style: { 
                        padding: '8px 12px',
                        backgroundColor: '#F9FAFB',
                        borderRadius: '4px',
                        border: '1px solid #E5E7EB'
                      } 
                    },
                    React.createElement(
                      'div',
                      { style: { fontWeight: '500', color: '#111827', fontSize: '14px' } },
                      test.testName
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: '12px', color: '#6B7280', marginTop: '4px' } },
                      formatCurrencySync(test.price || 0, displayCurrency || 'USD')
                    )
                  )
                )
              )
            )
          )
        )
      ) : (
        React.createElement(
          'div',
          { style: { 
            padding: '48px', 
            backgroundColor: '#F9FAFB', 
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            textAlign: 'center'
          } },
          React.createElement(
            'p',
            { style: { color: '#6B7280', fontSize: '16px', marginBottom: '8px' } },
            '⚠️ No tests selected yet'
          ),
          React.createElement(
            'p',
            { style: { color: '#9CA3AF', fontSize: '14px' } },
            'Click "Select My Tests" to choose which tests you can perform in your laboratory.'
          )
        )
      )
    );
  };

  const renderStatsTab = () => {
    if (!stats && !selectedDoctorForHistory) return React.createElement('div', null, 'Loading statistics...');

    // History view when a doctor is selected
    if (selectedDoctorForHistory) {
      return React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' } },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => {
                setSelectedDoctorForHistory(null);
                setDoctorHistoryTests([]);
              },
              style: {
                padding: '8px 12px',
                fontSize: '14px',
                backgroundColor: '#F3F4F6',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer'
              }
            },
            'Back'
          ),
          React.createElement(
            'h3',
            { style: { fontSize: '18px', fontWeight: '600', margin: 0, color: '#111827' } },
            `History for ${selectedDoctorForHistory.name}`
          )
        ),
        React.createElement(
          'div',
          { className: 'overflow-x-auto' },
          React.createElement(
            'table',
            { className: 'min-w-full divide-y divide-gray-200' },
            React.createElement(
              'thead',
              { className: 'bg-gray-50' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Patient'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Test'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Status'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Date')
              )
            ),
            React.createElement(
              'tbody',
              { className: 'bg-white divide-y divide-gray-200' },
              doctorHistoryLoading ? React.createElement(
                'tr',
                null,
                React.createElement('td', { colSpan: 4, className: 'px-6 py-4 text-center text-gray-500' }, 'Loading...')
              ) : doctorHistoryTests.length === 0 ? React.createElement(
                'tr',
                null,
                React.createElement('td', { colSpan: 4, className: 'px-6 py-4 text-center text-gray-500' }, 'No tests ordered by this doctor.')
              ) : doctorHistoryTests.map(test =>
                React.createElement(
                  'tr',
                  { key: test.id, className: 'hover:bg-gray-50' },
                  React.createElement(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' },
                    test.patient?.name || patients.find(p => p.id === test.patientId)?.name || 'Unknown'
                  ),
                  React.createElement(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                    test.testNameSnapshot || test.testCatalog?.testName || 'Unknown'
                  ),
                  React.createElement(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    React.createElement(
                      'span',
                      {
                        className: `px-2 py-1 text-xs font-semibold rounded-full ${
                          test.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          test.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                          test.status === 'PENDING' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`
                      },
                      test.status
                    )
                  ),
                  React.createElement(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                    new Date(test.createdAt).toLocaleDateString()
                  )
                )
              )
            )
          )
        )
      );
    }

    // Main stats view: total, recent, tests by doctor
    return React.createElement(
      'div',
      null,
      React.createElement(
        'h3',
        { style: { fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#111827' } },
        'Lab Test Statistics'
      ),
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' } },
        React.createElement(
          'div',
          { style: { backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E5E7EB' } },
          React.createElement('h4', { style: { fontSize: '14px', fontWeight: '500', color: '#6B7280', margin: '0 0 8px 0' } }, 'Total Tests'),
          React.createElement('p', { style: { fontSize: '24px', fontWeight: '600', color: '#111827', margin: 0 } }, stats?.totalLabTests ?? 0)
        ),
        React.createElement(
          'div',
          { style: { backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E5E7EB' } },
          React.createElement('h4', { style: { fontSize: '14px', fontWeight: '500', color: '#6B7280', margin: '0 0 8px 0' } }, 'Recent Tests'),
          React.createElement('p', { style: { fontSize: '24px', fontWeight: '600', color: '#111827', margin: 0 } }, stats?.recentLabTests ?? 0)
        )
      ),
      stats?.labTestsByDoctor?.length > 0 && React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'h4',
          { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#374151' } },
          'Tests by doctor'
        ),
        React.createElement(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' } },
          stats.labTestsByDoctor.map(doc =>
            React.createElement(
              'button',
              {
                key: doc.orderedBy,
                type: 'button',
                onClick: () => {
                  setSelectedDoctorForHistory({ id: doc.orderedBy, name: doc.doctorName });
                  loadDoctorHistory(doc.orderedBy);
                },
                style: {
                  backgroundColor: '#FFFFFF',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                },
                onMouseEnter: (e) => {
                  e.currentTarget.style.borderColor = '#3B82F6';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.15)';
                },
                onMouseLeave: (e) => {
                  e.currentTarget.style.borderColor = '#E5E7EB';
                  e.currentTarget.style.boxShadow = 'none';
                }
              },
              React.createElement('div', { style: { fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' } }, doc.doctorName || 'Unknown'),
              React.createElement('div', { style: { fontSize: '20px', fontWeight: '600', color: '#3B82F6' } }, doc.count)
            )
          )
        )
      )
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'tests':
        return renderLabTestsTab();
      case 'catalog':
        return renderCatalogTab();
      case 'myTests':
        return renderMyTestsTab();
      case 'stats':
        return renderStatsTab();
      default:
        return renderLabTestsTab();
    }
  };

  const renderLabTestForm = () => {
    if (!showAddForm) return null;

    return React.createElement(
      'div',
      { style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 } },
      React.createElement(
        'div',
        { style: { backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '24px', width: '100%', maxWidth: '500px', position: 'relative' } },
        // Close button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              setShowAddForm(false);
              setEditingLabTest(null);
              setFormData({ patientId: '', orderedBy: '', testCatalogId: '', notes: '' });
            },
            style: { 
              position: 'absolute', 
              top: '16px', 
              right: '16px', 
              backgroundColor: 'transparent', 
              border: 'none', 
              cursor: 'pointer', 
              padding: '4px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '4px', 
              transition: 'background-color 0.2s',
              zIndex: 10
            },
            onMouseEnter: (e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; },
            onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent'; }
          },
          React.createElement(
            'svg',
            { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: '#6B7280', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
            React.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
          )
        ),
        React.createElement(
          'h2',
          { style: { fontSize: '18px', fontWeight: '600', marginBottom: '16px', paddingRight: '32px' } },
          editingLabTest ? 'Edit Lab Test' : 'Add New Lab Test'
        ),
        React.createElement(
          'form',
          { onSubmit: handleSubmit, style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
          React.createElement(
            'div',
            null,
            React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Patient'),
            React.createElement(
              'select',
              {
                name: 'patientId',
                required: true,
                value: formData.patientId,
                onChange: (e) => setFormData({...formData, patientId: e.target.value}),
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: '' }, patients.length > 0 ? 'Select Patient' : 'Loading patients...'),
              Array.isArray(patients) ? patients.map(patient => 
                React.createElement('option', { key: patient.id, value: patient.id }, `${patient.name || 'Unknown'} (${patient.phone || 'N/A'})`)
      ) : null
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Test'),
            React.createElement(
              'select',
              {
                name: 'testCatalogId',
                required: true,
                value: formData.testCatalogId,
                onChange: (e) => setFormData({...formData, testCatalogId: e.target.value}),
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: '' }, (() => {
                // Filter tests based on user role for the dropdown
                const availableTests = user.role === 'LAB_TECH' 
                  ? testCatalog.filter(test => mySelectedTests.includes(test.id))
                  : testCatalog;
                return availableTests.length > 0 ? 'Select Test' : (user.role === 'LAB_TECH' ? 'No tests assigned' : 'Loading tests...');
              })()),
              (() => {
                // Filter tests based on user role
                const availableTests = user.role === 'LAB_TECH' 
                  ? testCatalog.filter(test => mySelectedTests.includes(test.id))
                  : testCatalog;
                return Array.isArray(availableTests) ? availableTests.map(test => 
                  React.createElement('option', { key: test.id, value: test.id }, test.testName || 'Unknown')
                ) : null;
              })()
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Ordered By'),
            React.createElement(
              'select',
              {
                name: 'orderedBy',
                required: true,
                value: formData.orderedBy,
                onChange: (e) => setFormData({...formData, orderedBy: e.target.value}),
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: '' }, doctors.length > 0 ? 'Select Doctor' : 'Loading doctors...'),
              Array.isArray(doctors) ? doctors.map(doctor => 
                React.createElement('option', { key: doctor.id, value: doctor.id }, doctor.fullName || 'Unknown')
              ) : null
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Notes'),
            React.createElement('textarea', {
              name: 'notes',
              value: formData.notes,
              onChange: (e) => setFormData({...formData, notes: e.target.value}),
              rows: 3,
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical'
              }
            })
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' } },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowAddForm(false);
                  resetForm();
                },
                style: {
                  padding: '8px 16px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  backgroundColor: '#FFFFFF',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px'
                }
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: loading,
                style: {
                  padding: '8px 16px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: loading ? 0.6 : 1
                }
              },
              loading ? 'Saving...' : 'Save'
            )
          )
        )
      )
    );
  };

  // Map test categories to lab types
  const mapCategoryToLabType = (category) => {
    if (!category) return 'General';
    
    const categoryUpper = category.toUpperCase();
    
    // Direct matches
    if (categoryUpper === 'MRI') return 'MRI';
    if (categoryUpper === 'CT SCAN' || categoryUpper === 'CT') return 'CT Scan';
    if (categoryUpper === 'X-RAY' || categoryUpper === 'XRAY') return 'X-Ray';
    if (categoryUpper === 'ULTRASOUND' || categoryUpper === 'USG') return 'Ultrasound';
    if (categoryUpper === 'PATHOLOGY') return 'Pathology';
    if (categoryUpper === 'GENERAL') return 'General';
    
    // Default: General Laboratory (for Biochemistry, Endocrinology, Cardiology, etc.)
    return 'General';
  };

  const renderTechSelectionForm = () => {
    if (!showTechSelection) return null;

    // Filter tests based on selected lab type
    let filteredTests = availableTests;
    
    if (selectedLabType === 'ALL TESTS') {
      // Show all tests when "ALL TESTS" is selected
      filteredTests = availableTests;
    } else {
      // Filter tests by matching their category to the selected lab type
      filteredTests = availableTests.filter(test => {
        const testId = test.id;
        const testCategory = test.category || '';
        const testLabType = mapCategoryToLabType(testCategory);
        
        // Check if test category matches selected lab type
        const categoryMatches = testLabType === selectedLabType;
        
        // Also check if this test is already selected for the current lab type
        const testsForCurrentLabType = mySelectedTestsByType[selectedLabType] || [];
        const isSelectedForCurrentType = testsForCurrentLabType.length > 0 && testsForCurrentLabType.some(t => {
          const tId = typeof t === 'object' && t !== null && t.id ? t.id : (typeof t === 'string' ? t : null);
          return tId === testId;
        });
        
        // Show test if:
        // 1. Its category matches the selected lab type, OR
        // 2. It's already selected for the current lab type (even if category doesn't match)
        if (categoryMatches || isSelectedForCurrentType) {
          return true;
        }
        
        // Don't show tests that don't match the lab type
        return false;
      });
    }
    
    // Debug logging (can be removed in production)
    console.log(`[Lab Type Filter] Selected: ${selectedLabType}, Filtered: ${filteredTests.length}/${availableTests.length} tests`);

    // Group filtered tests by category
    const testsByCategory = filteredTests.reduce((acc, test) => {
      const category = test.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(test);
      return acc;
    }, {});

    return React.createElement(
      'div',
      { style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, overflow: 'auto' } },
      React.createElement(
        'div',
        { style: { backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '24px', width: '100%', maxWidth: '800px', maxHeight: '80vh', overflow: 'auto', position: 'relative' } },
        // Close button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              setShowTechSelection(false);
              setSelectedTechTests([]);
            },
            style: { 
              position: 'absolute', 
              top: '16px', 
              right: '16px', 
              backgroundColor: 'transparent', 
              border: 'none', 
              cursor: 'pointer', 
              padding: '4px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '4px', 
              transition: 'background-color 0.2s',
              zIndex: 10
            },
            onMouseEnter: (e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; },
            onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent'; }
          },
          React.createElement(
            'svg',
            { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: '#6B7280', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
            React.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
          )
        ),
        React.createElement(
          'h2',
          { style: { fontSize: '18px', fontWeight: '600', marginBottom: '8px', paddingRight: '32px' } },
          mySelectedTests.length > 0 ? 'Update Your Selected Tests' : 'Select Tests You Can Perform'
        ),
        React.createElement(
          'p',
          { style: { fontSize: '14px', color: '#6B7280', marginBottom: '16px' } },
          selectedLabType === 'ALL TESTS'
            ? 'Viewing all tests from the database. Select a specific lab type to assign tests.'
            : mySelectedTests.length > 0
              ? `Select or update tests for ${selectedLabType} laboratory. Your changes will replace previous selections for this lab type. You can update anytime.`
              : `Select which tests you can perform in the ${selectedLabType} laboratory. You can update your selections anytime.`
        ),
        React.createElement(
          'form',
          { onSubmit: handleTechSelectionSubmit, style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
          React.createElement(
            'div',
            null,
            React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Lab Type *'),
            React.createElement(
              'select',
              {
                required: true,
                value: selectedLabType,
                onChange: (e) => {
                  const nextType = e.target.value;
                  setSelectedLabType(nextType);
                  
                  // If "ALL TESTS" is selected, don't filter selections
                  if (nextType === 'ALL TESTS') {
                    // Clear selected tests when viewing all tests
                    setSelectedTechTests([]);
                  } else {
                    // Get tests for the selected lab type
                    const testsForType = mySelectedTestsByType[nextType] || [];
                    const testIds = testsForType.map(t => {
                      // Handle both object and string ID formats
                      return typeof t === 'object' && t.id ? t.id : t;
                    });
                    
                    // Also check tests that have saved datapoint selections for this lab type
                    const testsWithSavedDatapoints = availableTests.filter(test => {
                      if (!test.referenceRange) return false;
                      const allPts = parseReferenceRange(test.referenceRange);
                      const datapointNames = allPts.filter(p => p.type !== 'section').map(p => p.name);
                      if (datapointNames.length === 0) return false;
                      
                      const saved = loadDpForTest(test.id);
                      const selectedCount = datapointNames.filter(name => saved[name]).length;
                      return selectedCount > 0;
                    }).map(t => t.id);
                    
                    // Combine both: previously selected tests and tests with saved datapoints
                    const combined = [...new Set([...testIds, ...testsWithSavedDatapoints])];
                    setSelectedTechTests(combined);
                  }
                  
                  // Scroll to top of test list when lab type changes
                  setTimeout(() => {
                    const testListContainer = document.querySelector('[data-test-list-container]');
                    if (testListContainer) {
                      testListContainer.scrollTop = 0;
                    }
                  }, 100);
                },
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: 'ALL TESTS' }, 'ALL TESTS'),
              React.createElement('option', { value: 'General' }, 'General Laboratory'),
              React.createElement('option', { value: 'MRI' }, 'MRI Lab'),
              React.createElement('option', { value: 'CT Scan' }, 'CT Scan Lab'),
              React.createElement('option', { value: 'X-Ray' }, 'X-Ray Lab'),
              React.createElement('option', { value: 'Ultrasound' }, 'Ultrasound Lab'),
              React.createElement('option', { value: 'Pathology' }, 'Pathology Lab')
            )
          ),
          filteredTests.length === 0 ? React.createElement(
            'div',
            { style: { padding: '24px', textAlign: 'center', color: '#6B7280' } },
            React.createElement('p', { style: { marginBottom: '8px', fontSize: '16px', fontWeight: '500' } }, 'No tests available'),
            React.createElement('p', { style: { fontSize: '14px' } }, selectedLabType === 'ALL TESTS' 
              ? 'No tests found in the database.'
              : `No tests available for ${selectedLabType} laboratory. Try selecting "ALL TESTS" to view all available tests.`
            )
          ) : React.createElement(
            'div',
            { 
              'data-test-list-container': true,
              style: { maxHeight: '400px', overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '16px' } 
            },
            selectedLabType !== 'ALL TESTS' && React.createElement(
              'div',
              { style: { marginBottom: '12px', padding: '8px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '13px', color: '#1E40AF', fontWeight: '500' } },
              `Showing ${filteredTests.length} test${filteredTests.length !== 1 ? 's' : ''} for ${selectedLabType} laboratory`
            ),
            selectedLabType === 'ALL TESTS' && React.createElement(
              'div',
              { style: { marginBottom: '12px', padding: '8px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '4px', fontSize: '13px', color: '#92400E', fontWeight: '500' } },
              `Showing all ${filteredTests.length} test${filteredTests.length !== 1 ? 's' : ''} from database. Select a specific lab type to assign tests.`
            ),
            Object.entries(testsByCategory).map(([category, tests]) => 
              React.createElement(
                'div',
                { key: category, style: { marginBottom: '24px' } },
                React.createElement(
                  'h3',
                  { style: { fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '8px' } },
                  `${category} (${tests.length})`
                ),
                React.createElement(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  tests.map(test => 
                    React.createElement(
                      'label',
                      {
                        key: test.id,
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: selectedTechTests.includes(test.id) ? '#DBEAFE' : 'transparent',
                          border: '1px solid',
                          borderColor: selectedTechTests.includes(test.id) ? '#3B82F6' : '#E5E7EB'
                        }
                      },
                      React.createElement(
                        'input',
                        {
                          type: 'checkbox',
                          checked: selectedTechTests.includes(test.id),
                          onChange: (e) => {
                            // Get datapoints for this test
                            const allPts = test.referenceRange ? parseReferenceRange(test.referenceRange) : [];
                            const datapointNames = allPts.filter(p => p.type !== 'section').map(p => p.name);
                            
                            if (e.target.checked) {
                              // Check main test - also select all datapoints
                              setSelectedTechTests([...selectedTechTests, test.id]);
                              
                              if (datapointNames.length > 0) {
                                const current = dpSelections[test.id] || {};
                                const allSelected = {};
                                datapointNames.forEach(name => {
                                  allSelected[name] = true;
                                });
                                const updated = { ...current, ...allSelected };
                                setDpSelections({ ...dpSelections, [test.id]: updated });
                                saveDpForTest(test.id, updated);
                              }
                            } else {
                              // Uncheck main test - also unselect all datapoints
                              setSelectedTechTests(selectedTechTests.filter(id => id !== test.id));
                              
                              if (datapointNames.length > 0) {
                                const updated = {};
                                setDpSelections({ ...dpSelections, [test.id]: updated });
                                saveDpForTest(test.id, updated);
                              }
                            }
                          },
                          style: { marginRight: '8px', cursor: 'pointer' }
                        }
                      ),
                      React.createElement(
                        'div',
                        { style: { flex: 1 } },
                        React.createElement('div', { style: { fontWeight: '500', color: '#111827' } }, test.testName),
                        test.description && React.createElement('div', { style: { fontSize: '12px', color: '#6B7280', marginTop: '4px' } }, test.description),
                        // Show datapoints directly as checkboxes (no button needed)
                        test.referenceRange && (() => {
                          // Parse and filter datapoints
                          const allPts = parseReferenceRange(test.referenceRange);
                          // Filter out "result" from datapoints (case-insensitive)
                          const pts = allPts.filter(p => {
                            if (p.type === 'section') return true; // Keep section headers
                            // Remove "result" (case-insensitive)
                            return !p.name || p.name.toLowerCase() !== 'result';
                          });
                          
                          // Auto-load saved selections if not already loaded
                          if (!dpSelections[test.id] && pts.length > 0) {
                            const loaded = loadDpForTest(test.id);
                            if (Object.keys(loaded).length > 0) {
                              setDpSelections({ ...dpSelections, [test.id]: loaded });
                            }
                          }
                          
                          const current = dpSelections[test.id] || {};
                          
                          if (pts.length === 0) return null;
                          
                          return React.createElement(
                            'div',
                            { style: { marginTop: '8px', padding: '8px', backgroundColor: '#F9FAFB', borderRadius: '4px', border: '1px solid #E5E7EB' } },
                            React.createElement(
                              'div',
                              { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' } },
                              pts.map((p, i) => p.type === 'section'
                                ? React.createElement(
                                    'div',
                                    { key: `sec-${i}`, style: { gridColumn: '1 / -1', fontSize: '11px', fontWeight: '700', color: '#111827', textTransform: 'uppercase', marginTop: i === 0 ? 0 : 8, marginBottom: '4px' } },
                                    p.name
                                  )
                                : React.createElement(
                                    'label',
                                    {
                                      key: `pt-${i}`,
                                      style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        color: '#374151',
                                        cursor: 'pointer',
                                        padding: '2px 0'
                                      },
                                      onClick: (ev) => ev.stopPropagation() // Prevent parent checkbox toggle
                                    },
                                    React.createElement('input', {
                                      type: 'checkbox',
                                      checked: !!current[p.name],
                                      onChange: (ev) => {
                                        ev.stopPropagation(); // Prevent parent checkbox toggle
                                        const next = { ...(dpSelections[test.id] || {}) };
                                        if (ev.target.checked) {
                                          next[p.name] = true;
                                        } else {
                                          delete next[p.name];
                                        }
                                        setDpSelections({ ...dpSelections, [test.id]: next });
                                        saveDpForTest(test.id, next);
                                        
                                        // Check if any datapoint is selected to auto-check main test
                                        const updatedSelected = Object.keys(next).filter(key => next[key]);
                                        if (updatedSelected.length > 0 && !selectedTechTests.includes(test.id)) {
                                          setSelectedTechTests([...selectedTechTests, test.id]);
                                        } else if (updatedSelected.length === 0 && selectedTechTests.includes(test.id)) {
                                          setSelectedTechTests(selectedTechTests.filter(id => id !== test.id));
                                        }
                                      },
                                      style: { cursor: 'pointer', margin: 0 }
                                    }),
                                    p.name
                                  )
                              )
                            )
                          );
                        })()
                      ),
                      // Price input field for editing
                      React.createElement(
                        'div',
                        { 
                          style: { 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            minWidth: '140px'
                          },
                          onClick: (e) => e.stopPropagation() // Prevent parent checkbox toggle
                        },
                        React.createElement('span', { style: { fontSize: '12px', color: '#6B7280', fontWeight: '500' } }, getCurrencySymbol(displayCurrency || 'USD')),
                        React.createElement('input', {
                          type: 'number',
                          min: 0,
                          step: '0.01',
                          value: techPriceEdits[test.id] !== undefined 
                            ? techPriceEdits[test.id] 
                            : (loadTechPriceForTest(test.id) !== null 
                              ? loadTechPriceForTest(test.id) 
                              : (test.price || 0)),
                          onChange: (e) => {
                            e.stopPropagation(); // Prevent parent checkbox toggle
                            const newPrice = parseFloat(e.target.value);
                            if (!isNaN(newPrice) && newPrice >= 0) {
                              setTechPriceEdits({ ...techPriceEdits, [test.id]: newPrice });
                              saveTechPriceForTest(test.id, newPrice);
                            } else if (e.target.value === '' || e.target.value === '-') {
                              // Allow empty or minus for editing
                              setTechPriceEdits({ ...techPriceEdits, [test.id]: e.target.value });
                            }
                          },
                          onFocus: autoSelectIfZero,
                          onMouseDown: autoSelectIfZeroMouseDown,
                          onBlur: (e) => {
                            const price = parseFloat(e.target.value);
                            // Validate: must be a valid number >= 0
                            if (isNaN(price) || price < 0 || e.target.value.trim() === '') {
                              // Reset to saved price if available, otherwise original price
                              const savedPrice = loadTechPriceForTest(test.id);
                              const originalPrice = savedPrice !== null ? savedPrice : (test.price || 0);
                              setTechPriceEdits({ ...techPriceEdits, [test.id]: originalPrice });
                              saveTechPriceForTest(test.id, originalPrice);
                            } else {
                              // Ensure the saved price matches the current value
                              const currentValue = parseFloat(e.target.value);
                              if (!isNaN(currentValue) && currentValue >= 0) {
                                saveTechPriceForTest(test.id, currentValue);
                              }
                            }
                          },
                          style: {
                            width: '80px',
                            padding: '4px 6px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '4px',
                            fontSize: '12px',
                            textAlign: 'right'
                          },
                          placeholder: '0.00'
                        })
                      )
                    )
                  )
                )
              )
            )
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' } },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowTechSelection(false);
                  setSelectedTechTests([]);
                },
                style: {
                  padding: '8px 16px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  backgroundColor: '#FFFFFF',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px'
                }
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: loading || selectedLabType === 'ALL TESTS',
                style: {
                  padding: '8px 16px',
                  backgroundColor: selectedLabType === 'ALL TESTS' ? '#9CA3AF' : '#2563EB',
                  color: '#FFFFFF',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: selectedLabType === 'ALL TESTS' ? 'not-allowed' : (loading ? 'not-allowed' : 'pointer'),
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: (loading || selectedLabType === 'ALL TESTS') ? 0.6 : 1
                },
                title: selectedLabType === 'ALL TESTS' ? 'Select a specific lab type to assign tests' : ''
              },
              selectedLabType === 'ALL TESTS' 
                ? 'Select Lab Type to Assign'
                : (loading ? 'Saving...' : (selectedTechTests.length === 0 ? 'Clear Selections' : `Update (${selectedTechTests.length} test${selectedTechTests.length !== 1 ? 's' : ''})`))
            )
          )
        )
      )
    );
  };

  const renderResultForm = () => {
    if (!showResultForm) return null;

    return React.createElement(
      'div',
      { style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 } },
      React.createElement(
        'div',
        { style: { backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', position: 'relative' } },
        // Close button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              setShowResultsModal(false);
              setEditingLabTest(null);
              setResultFormData({});
            },
            style: { position: 'absolute', top: '16px', right: '16px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', transition: 'background-color 0.2s' },
            onMouseEnter: (e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; },
            onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent'; }
          },
          React.createElement(
            'svg',
            { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: '#6B7280', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
            React.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
            React.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
          )
        ),
        React.createElement(
          'h2',
          { style: { fontSize: '18px', fontWeight: '600', marginBottom: '16px', paddingRight: '32px' } },
          editingLabTest?.status === 'COMPLETED' ? 'View Test Results' : 'Enter Test Results'
        ),
        React.createElement(
          'div',
          { style: { marginBottom: '16px', padding: '12px', backgroundColor: '#F3F4F6', borderRadius: '4px', fontSize: '14px' } },
          React.createElement('div', { style: { marginBottom: '8px' } }, React.createElement('strong', null, 'Patient: '), editingLabTest?.patient?.name || patients.find(p => p.id === editingLabTest?.patientId)?.name || 'Unknown'),
          React.createElement('div', { style: { marginBottom: '8px' } }, React.createElement('strong', null, 'Test: '), editingLabTest?.testNameSnapshot || editingLabTest?.testCatalog?.testName || testDetailsForResult?.testName || 'Unknown'),
          testDetailsForResult?.description && React.createElement('div', { style: { marginTop: '8px', fontSize: '12px', color: '#6B7280' } }, testDetailsForResult.description)
        ),
        React.createElement(
          'form',
          { onSubmit: handleResultSubmit, style: { display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, paddingRight: '8px' } },
          // Show structured data points if available
          (() => {
            if (testDetailsForResult?.referenceRange) {
              const dataPoints = parseReferenceRange(testDetailsForResult.referenceRange);
              if (dataPoints.length > 0) {
                return React.createElement(
                  'div',
                  null,
                  editingLabTest?.status === 'COMPLETED' && editingLabTest?.results ? (
                    // Show formatted results table for completed tests
                    React.createElement(
                      'div',
                      null,
                      React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '12px' } }, 'Test Results'),
                      React.createElement(
                        'div',
                        { style: { backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '4px', overflow: 'hidden' } },
                        React.createElement(
                          'table',
                          { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } },
                          React.createElement(
                            'thead',
                            { style: { backgroundColor: '#F9FAFB' } },
                            React.createElement(
                              'tr',
                              null,
                              React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #E5E7EB' } }, 'Investigation'),
                              React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #E5E7EB' } }, 'Result'),
                              React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #E5E7EB' } }, 'Reference Value'),
                              React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #E5E7EB' } }, 'Unit')
                            )
                          ),
                          React.createElement(
                            'tbody',
                            null,
                dataPoints.map((point, idx) => {
                  if (point.type === 'section') {
                    return React.createElement(
                      'tr',
                      { key: `sec-${idx}` },
                      React.createElement(
                        'td',
                        { colSpan: 4, style: { padding: '14px 16px', color: '#111827', fontWeight: '700', textTransform: 'uppercase', backgroundColor: '#F3F4F6', fontSize: '13px', letterSpacing: '0.5px', borderBottom: '2px solid #E5E7EB', borderTop: '2px solid #E5E7EB' } },
                        point.name
                      )
                    );
                  }
                              const value = resultDataPoints[point.name] || '';
                              const status = calculateStatus(value, point.minValue, point.maxValue, point.referenceRange);
                              const statusColors = {
                                'Low': { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
                                'High': { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
                                'Borderline': { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
                                'Normal': { bg: '#D1FAE5', text: '#065F46', border: '#10B981' }
                              };
                              const colorStyle = status ? statusColors[status] : null;
                              
                              return React.createElement(
                                'tr',
                                { key: idx, style: { borderBottom: '1px solid #E5E7EB', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB', transition: 'background-color 0.2s' } },
                                React.createElement('td', { style: { padding: '14px 16px', color: '#111827', fontWeight: '500', fontSize: '14px' } }, point.name),
                                React.createElement(
                                  'td',
                                  { 
                                    style: { 
                                      padding: '14px 16px',
                                      color: colorStyle?.text || '#111827',
                                      backgroundColor: colorStyle?.bg || 'transparent',
                                      borderLeft: colorStyle?.border ? `4px solid ${colorStyle.border}` : 'none',
                                      fontWeight: status ? '600' : '500',
                                      fontSize: '14px',
                                      borderRadius: colorStyle?.border ? '4px 0 0 4px' : '0'
                                    }
                                  },
                                  value || '-',
                                  status && React.createElement(
                                    'span',
                                    { style: { marginLeft: '10px', fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.7)' } },
                                    status.toUpperCase()
                                  )
                                ),
                                React.createElement('td', { style: { padding: '14px 16px', color: '#6B7280', fontSize: '13px' } }, point.referenceRange || '-'),
                                React.createElement('td', { style: { padding: '14px 16px', color: '#6B7280', fontSize: '13px', fontStyle: 'italic' } }, point.unit || '-')
                              );
                            })
                          )
                        )
                      )
                    )
                  ) : (
                    // Show input form for entering/editing results
                    React.createElement(
                      'div',
                      null,
                      React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '12px' } }, 'Test Results *'),
                      React.createElement(
                        'div',
                        { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
            dataPoints.map((point, idx) => {
              if (point.type === 'section') {
                return React.createElement(
                  'div',
                  { key: `sec-${idx}`, style: { marginTop: '12px', marginBottom: '4px', color: '#111827', fontWeight: '700', fontSize: '13px', textTransform: 'uppercase' } },
                  point.name
                );
              }

              const value = resultDataPoints[point.name] || '';
              const status = calculateStatus(value, point.minValue, point.maxValue, point.referenceRange);
              
              return React.createElement(
                'div',
                { key: idx },
                React.createElement(
                  'label',
                  { style: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' } },
                  `${point.name}${point.referenceRange ? ` (Ref: ${point.referenceRange}${point.unit ? ` ${point.unit}` : ''})` : point.unit ? ` (${point.unit})` : ''}`
                ),
                React.createElement('input', {
                  type: 'text',
                  value: value,
                  onChange: (e) => {
                    const newValue = e.target.value;
                    setResultDataPoints({...resultDataPoints, [point.name]: newValue});
                  },
                  disabled: editingLabTest?.status === 'COMPLETED',
                  placeholder: `Enter ${point.name.toLowerCase()} value`,
                  style: {
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${status === 'Low' || status === 'High' ? '#EF4444' : '#D1D5DB'}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: editingLabTest?.status === 'COMPLETED' ? '#F9FAFB' : '#FFFFFF',
                    cursor: editingLabTest?.status === 'COMPLETED' ? 'not-allowed' : 'text'
                  }
                }),
                status && React.createElement(
                  'span',
                  { 
                    style: { 
                      fontSize: '12px', 
                      color: status === 'Low' || status === 'High' ? '#EF4444' : status === 'Borderline' ? '#F59E0B' : '#10B981',
                      marginTop: '4px',
                      display: 'block'
                    }
                  },
                  `Status: ${status}`
                )
              );
            })
                      )
                    )
                  )
                );
              }
            }
            return React.createElement(
              'div',
              null,
              React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Test Results *'),
              React.createElement('textarea', {
                name: 'results',
                required: true,
                value: resultData.results,
                onChange: (e) => setResultData({...resultData, results: e.target.value}),
                rows: 4,
                placeholder: testDetailsForResult?.referenceRange ? `Enter test results. Reference: ${testDetailsForResult.referenceRange}` : 'Enter test results, values, observations...',
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              })
            );
          })(),
          React.createElement(
            'div',
            null,
            React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Notes'),
            React.createElement('textarea', {
              name: 'notes',
              value: resultData.notes,
              onChange: (e) => setResultData({...resultData, notes: e.target.value}),
              disabled: editingLabTest?.status === 'COMPLETED',
              rows: 3,
              placeholder: 'Additional notes or comments...',
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical',
                backgroundColor: editingLabTest?.status === 'COMPLETED' ? '#F9FAFB' : '#FFFFFF',
                cursor: editingLabTest?.status === 'COMPLETED' ? 'not-allowed' : 'text'
              }
            })
          ),
          (() => {
            const testCategory = testDetailsForResult?.category || editingLabTest?.testCatalog?.category;
            const requiresReportFile = testCategory === 'MRI' || testCategory === 'CT Scan' || testCategory === 'X-Ray';
            
            if (requiresReportFile) {
              // Show uploaded file if test is completed
              if (editingLabTest?.status === 'COMPLETED' && editingLabTest?.reportFile) {
                return React.createElement(
                  'div',
                  null,
                  React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Report File'),
                  React.createElement(
                    'div',
                    { style: { padding: '12px', backgroundColor: '#F3F4F6', borderRadius: '4px', fontSize: '14px', color: '#6B7280' } },
                    React.createElement('div', { style: { marginBottom: '4px' } }, 'Uploaded: ' + (editingLabTest.reportFile.split(/[\\/]/).pop() || editingLabTest.reportFile)),
                    React.createElement(
                      'a',
                      {
                        href: '#',
                        onClick: (e) => {
                          e.preventDefault();
                          window.open('/api/uploads/' + editingLabTest.reportFile.split(/[\\/]/).pop(), '_blank');
                        },
                        style: { color: '#3B82F6', textDecoration: 'underline', fontSize: '13px' }
                      },
                      'View Report'
                    )
                  )
                );
              }
              
              // Show file upload input for active tests
              return React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } },
                  'Report File (PDF/Image)',
                  React.createElement('span', { style: { color: '#EF4444', marginLeft: '4px' } }, '*')
                ),
                React.createElement('input', {
                  type: 'file',
                  name: 'reportFile',
                  accept: '.pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp',
                  onChange: (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedReportFile(file);
                      if (file.size > 10 * 1024 * 1024) {
                        setError('File size must be less than 10MB');
                        setSelectedReportFile(null);
                        e.target.value = '';
                        return;
                      }
                      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp'];
                      if (!validTypes.includes(file.type)) {
                        setError('Invalid file type. Please upload PDF or image files only.');
                        setSelectedReportFile(null);
                        e.target.value = '';
                        return;
                      }
                      setError('');
                    }
                  },
                  disabled: editingLabTest?.status === 'COMPLETED',
                  required: true,
                  style: {
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: editingLabTest?.status === 'COMPLETED' ? '#F9FAFB' : '#FFFFFF',
                    cursor: editingLabTest?.status === 'COMPLETED' ? 'not-allowed' : 'pointer'
                  }
                }),
                selectedReportFile && React.createElement(
                  'div',
                  { style: { marginTop: '8px', fontSize: '13px', color: '#6B7280' } },
                  'Selected: ' + selectedReportFile.name + ' (' + (selectedReportFile.size / 1024 / 1024).toFixed(2) + ' MB)'
                )
              );
            }
            
            // For other tests, show optional text input
            return React.createElement(
              'div',
              null,
              React.createElement('label', { style: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' } }, 'Report File (Optional)'),
              React.createElement('input', {
                type: 'text',
                name: 'reportFile',
                value: resultData.reportFile,
                onChange: (e) => setResultData({...resultData, reportFile: e.target.value}),
                placeholder: 'Path to report file (PDF, image, etc.)',
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              })
            );
          })(),
          editingLabTest?.status !== 'COMPLETED' && React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' } },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowResultForm(false);
                  resetResultForm();
                },
                style: {
                  padding: '8px 16px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  backgroundColor: '#FFFFFF',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px'
                }
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: loading,
                style: {
                  padding: '8px 16px',
                  backgroundColor: '#059669',
                  color: '#FFFFFF',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: loading ? 0.6 : 1
                }
              },
              loading ? 'Saving...' : 'Complete Test'
            )
          ),
          editingLabTest?.status === 'COMPLETED' && React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '2px solid #E5E7EB' } },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: async () => {
                  try {
                    setLoading(true);
                    setError('');
                    const fullLabTest = await labTestService.getLabTestById(editingLabTest.id);
                    await LabTestPDFGenerator.generateLabTestPDF(fullLabTest.labTest || fullLabTest.data?.labTest || fullLabTest);
                  } catch (error) {
                    console.error('Error generating PDF:', error);
                    setError('Failed to generate PDF. Please try again.');
                  } finally {
                    setLoading(false);
                  }
                },
                disabled: loading,
                style: {
                  padding: '12px 24px',
                  backgroundColor: loading ? '#9CA3AF' : '#DC2626',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: loading ? 'none' : '0 4px 6px rgba(220, 38, 38, 0.3)',
                  transition: 'all 0.2s'
                }
              },
              loading ? '⏳ Generating...' : '📄 Export PDF'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowResultForm(false);
                  resetResultForm();
                },
                style: {
                  padding: '12px 24px',
                  border: '2px solid #D1D5DB',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }
              },
              'Close'
            )
          )
        )
    )
  );
};

  if (!isAuthenticated) {
    return React.createElement(
      'div',
      { style: { padding: '24px', textAlign: 'center' } },
      React.createElement('h2', { style: { fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '8px' } }, 'Authentication Required'),
      React.createElement('p', { style: { color: '#6B7280', marginBottom: '16px' } }, 'Please log in to access the Lab Test Management module.'),
      React.createElement(
        'button',
        {
          onClick: onBack,
          style: {
            padding: '8px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            backgroundColor: '#FFFFFF',
            color: '#374151',
            cursor: 'pointer',
            fontSize: '14px'
          }
        },
        'Go Back'
      )
    );
  }

  if (loading && labTests.length === 0) {
    return React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px' } },
      React.createElement('div', { style: { width: '32px', height: '32px', border: '2px solid #E5E7EB', borderTop: '2px solid #2563EB', borderRadius: '50%', animation: 'spin 1s linear infinite' } })
    );
  }

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F0F0F0', padding: '8px' } },
    React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '8px 12px' } },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #C8C8C8' } },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement(
            'h1',
            { style: { fontSize: '16px', fontWeight: '600', color: '#000000', margin: 0 } },
            '🧪 Lab Test Management'
          ),
          React.createElement(InfoButton, {
            title: getInfoContent('labTests').title,
            content: getInfoContent('labTests').content,
            size: 'md',
            variant: 'info'
          })
        ),
        React.createElement(
          'button',
          {
            onClick: () => setShowAddForm(true),
            style: {
              backgroundColor: '#0078D4',
              color: '#FFFFFF',
              border: '1px solid #005A9E',
              padding: '4px 12px',
              borderRadius: '2px',
              fontSize: '13px',
              fontWeight: '400',
              cursor: 'pointer',
              boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
            },
            onMouseOver: (e) => {
              e.target.style.backgroundColor = '#005A9E';
            },
            onMouseOut: (e) => {
              e.target.style.backgroundColor = '#0078D4';
            }
          },
          '+ Order Lab Test'
        )
      )
    ),
    // Error message
    error ? React.createElement(
      'div',
      { style: { marginBottom: '8px', padding: '6px 8px', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '2px', color: '#991B1B', fontSize: '13px' } },
      error
    ) : null,
    // Tabs
    renderTabs(),
    // Tab content
    renderTabContent(),
    // Forms
    renderLabTestForm(),
    renderResultForm(),
    renderTechSelectionForm()
  );
};

export default LabTestManagement;