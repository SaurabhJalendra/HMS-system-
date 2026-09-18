import React, { useState, useEffect, useRef } from 'react';
import { useCriticalUpdateLock } from '../../lib/hooks/useCriticalUpdateLock';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import patientService from '../../lib/api/services/patientService';
import catalogService from '../../lib/api/services/catalogService';
import LoadingSpinner from '../common/LoadingSpinner';
import InfoButton from '../common/InfoButton';
import { getInfoContent } from '../../lib/infoContent';
import { BLOOD_GROUP_OPTIONS, bloodGroupSelectValue, digitsOnly } from '../../lib/constants/patientFields';
import {
  canMutatePatientRecord,
  isAdminLevelRole,
} from '../../lib/utils/rolePermissions';

const PatientManagement = ({ user }: any = {}) => {
  const canMutatePatients = canMutatePatientRecord(user?.role);
  const canEditPatients = canMutatePatients && user?.role !== 'LAB_TECH';
  const canDeletePatients = isAdminLevelRole(user?.role);
  const isViewOnly = !canMutatePatients || user?.role === 'LAB_TECH';
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  useCriticalUpdateLock(
    Boolean(showEditModal || showDeleteConfirm),
    'patient-management'
  );
  const [patientHistory, setPatientHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 350);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const patientListRequestRef = useRef(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Catalog data for dropdowns
  const [allergyCatalog, setAllergyCatalog] = useState([]);
  const [conditionCatalog, setConditionCatalog] = useState([]);
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [selectedConditions, setSelectedConditions] = useState([]);
  const [conditionSearchTerm, setConditionSearchTerm] = useState('');
  const [allergySearchTerm, setAllergySearchTerm] = useState('');
  const [patientChronicConditions, setPatientChronicConditions] = useState([]); // For viewing patient's conditions
  const [patientAllergies, setPatientAllergies] = useState([]); // For viewing patient's allergies
  
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'MALE',
    phone: '',
    nationality: 'IN', // 'IN' = Indian (Aadhar), 'FOREIGN' = Passport
    aadharCardNumber: '',
    passportNumber: '',
    address: '',
    bloodGroup: '',
    bloodGroupOther: '',
    allergies: '',
    chronicConditions: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    referredBy: ''
  });
  
  useEffect(() => {
    loadCatalogs();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setAppliedSearch(debouncedSearch);
  }, [debouncedSearch]);

  useEffect(() => {
    loadPatients(appliedSearch);
  }, [appliedSearch, currentPage]);
  
  const loadCatalogs = async () => {
    try {
      const [allergies, conditions] = await Promise.all([
        catalogService.getAllAllergies(),
        catalogService.getAllChronicConditions()
      ]);
      setAllergyCatalog(allergies.allergies || []);
      setConditionCatalog(conditions.conditions || []);
      
      // Debug logging to verify all items are loaded
      console.log(`✅ Loaded ${allergies.allergies?.length || 0} allergies from catalog`);
      console.log(`✅ Loaded ${conditions.conditions?.length || 0} chronic conditions from catalog`);
      
      if ((allergies.allergies?.length || 0) < 50) {
        console.warn(`⚠️  Expected 50+ allergies but only ${allergies.allergies?.length || 0} loaded. Check if all items are active in database.`);
      }
      if ((conditions.conditions?.length || 0) < 50) {
        console.warn(`⚠️  Expected 50+ conditions but only ${conditions.conditions?.length || 0} loaded. Check if all items are active in database.`);
      }
    } catch (err) {
      console.error('Load catalog error:', err);
      // Don't block patient loading if catalogs fail
    }
  };

  const loadPatients = async (term = appliedSearch) => {
    const requestId = ++patientListRequestRef.current;
    try {
      setLoading(true);
      setError('');
      const trimmed = String(term || '').trim();
      const response = await patientService.getPatients({
        search: trimmed || undefined,
        page: currentPage,
        limit: 20,
      });
      if (requestId !== patientListRequestRef.current) return;
      if (response.patients) {
        const nextTotalPages = Math.max(1, response.pagination?.totalPages || 1);
        if (currentPage > nextTotalPages) {
          setCurrentPage(nextTotalPages);
          return;
        }
        setPatients(response.patients || []);
        setTotalPages(nextTotalPages);
      } else {
        setError('Failed to load patients');
      }
    } catch (err) {
      if (requestId !== patientListRequestRef.current) return;
      console.error('Load patients error:', err);
      setError('Error loading patients: ' + (err.response?.data?.message || err.message));
    } finally {
      if (requestId === patientListRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const runSearchNow = () => {
    if (currentPage === 1 && appliedSearch === searchTerm) {
      loadPatients(searchTerm);
      return;
    }
    setCurrentPage(1);
    setAppliedSearch(searchTerm);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === 'phone' || name === 'emergencyContactPhone') {
      next = digitsOnly(value, 10);
    } else if (name === 'age') {
      next = digitsOnly(value, 3);
    } else if (name === 'aadharCardNumber') {
      next = digitsOnly(value, 12);
    }
    setFormData(prev => ({
      ...prev,
      [name]: next
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setIsSubmitting(true);
      setError('');
      setSuccess('');
      
      // Send patient data (omit nationality - UI only; backend stores aadharCardNumber and passportNumber)
      const { nationality: _nationality, bloodGroupOther, ...rest } = formData;
      const ageNumber = parseInt(formData.age, 10);
      if (!formData.age || Number.isNaN(ageNumber) || ageNumber < 0 || ageNumber > 150) {
        setError('Please enter a valid age between 0 and 150');
        setIsSubmitting(false);
        return;
      }
      if (!/^[0-9]{10}$/.test(formData.phone)) {
        setError('Phone number must be exactly 10 digits');
        setIsSubmitting(false);
        return;
      }
      if (formData.nationality === 'IN' && formData.aadharCardNumber && !/^[0-9]{12}$/.test(formData.aadharCardNumber)) {
        setError('Aadhar card number must be exactly 12 digits');
        setIsSubmitting(false);
        return;
      }
      const patientData = {
        ...rest,
        age: ageNumber,
        bloodGroup:
          rest.bloodGroup === 'Other'
            ? (bloodGroupOther.trim() || 'Other')
            : rest.bloodGroup,
      };

      if (!selectedPatient) {
        setError('No patient selected for update.');
        setIsSubmitting(false);
        return;
      }

      await patientService.updatePatient(selectedPatient.id, patientData);

      // Handle chronic conditions - get existing ones first
      const existingConditions = await catalogService.getPatientChronicConditions(selectedPatient.id);
      const existingConditionIds = existingConditions.conditions.map(c => c.conditionId);

      for (const existingCondition of existingConditions.conditions) {
        if (!selectedConditions.includes(existingCondition.conditionId)) {
          await catalogService.deletePatientChronicCondition(selectedPatient.id, existingCondition.id);
        }
      }

      for (const conditionId of selectedConditions) {
        if (!existingConditionIds.includes(conditionId)) {
          await catalogService.addPatientChronicCondition(selectedPatient.id, {
            conditionId: conditionId,
            diagnosisDate: new Date().toISOString().split('T')[0],
            currentStatus: 'Active',
            notes: ''
          });
        }
      }

      const existingAllergies = await catalogService.getPatientAllergies(selectedPatient.id);
      const existingAllergyIds = existingAllergies.allergies.map(a => a.allergyId);

      for (const existingAllergy of existingAllergies.allergies) {
        if (!selectedAllergies.includes(existingAllergy.allergyId)) {
          await catalogService.deletePatientAllergy(selectedPatient.id, existingAllergy.id);
        }
      }

      for (const allergyId of selectedAllergies) {
        if (!existingAllergyIds.includes(allergyId)) {
          await catalogService.addPatientAllergy(selectedPatient.id, {
            allergyId: allergyId,
            severity: 'Unknown',
            notes: ''
          });
        }
      }

      setSuccess('Patient updated successfully!');
      setShowEditModal(false);

      // Reset form
      setFormData({
        name: '',
        age: '',
        gender: 'MALE',
        phone: '',
        nationality: 'IN',
        aadharCardNumber: '',
        passportNumber: '',
        address: '',
        bloodGroup: '',
        bloodGroupOther: '',
        allergies: '',
        chronicConditions: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        referredBy: ''
      });
      setSelectedPatient(null);
      setSelectedConditions([]);
      setSelectedAllergies([]);
      setConditionSearchTerm('');
      setAllergySearchTerm('');
      loadPatients(appliedSearch);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Save patient error:', err);
      setError('Error saving patient: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleView = async (patient) => {
    try {
      setLoadingHistory(true);
      setError('');
      const patientData = await patientService.getPatientById(patient.id);

      const [chronicConditionsResult, allergiesResult] = await Promise.allSettled([
        catalogService.getPatientChronicConditions(patient.id),
        catalogService.getPatientAllergies(patient.id)
      ]);
      setPatientChronicConditions(
        chronicConditionsResult.status === 'fulfilled'
          ? chronicConditionsResult.value.conditions || []
          : []
      );
      setPatientAllergies(
        allergiesResult.status === 'fulfilled'
          ? allergiesResult.value.allergies || []
          : []
      );

      setSelectedPatient(patientData);
      setPatientHistory({
        appointments: patientData.appointments || [],
        consultations: patientData.consultations || [],
        prescriptions: patientData.prescriptions || [],
        labTests: patientData.labTests || []
      });
      setShowViewModal(true);
    } catch (err) {
      console.error('Load patient details error:', err);
      setError('Error loading patient details: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleEdit = async (patient) => {
    try {
      setLoadingHistory(true);
      const patientData = await patientService.getPatientById(patient.id);
      
      // Load existing chronic conditions and allergies
      const [chronicConditionsResponse, allergiesResponse] = await Promise.all([
        catalogService.getPatientChronicConditions(patient.id),
        catalogService.getPatientAllergies(patient.id)
      ]);
      const existingConditionIds = chronicConditionsResponse.conditions.map(c => c.conditionId);
      const existingAllergyIds = allergiesResponse.allergies.map(a => a.allergyId);
      setSelectedConditions(existingConditionIds);
      setSelectedAllergies(existingAllergyIds);
      
      setSelectedPatient(patientData);
      const storedPhone = digitsOnly(patientData.phone || '', 15);
      const selectedBloodGroup = bloodGroupSelectValue(patientData.bloodGroup);
      setFormData({
        name: patientData.name || '',
        age: patientData.age != null ? String(patientData.age) : '',
        gender: patientData.gender || 'MALE',
        phone: storedPhone.length > 10 ? storedPhone.slice(-10) : storedPhone,
        nationality: patientData.passportNumber ? 'FOREIGN' : 'IN',
        aadharCardNumber: patientData.aadharCardNumber || '',
        passportNumber: patientData.passportNumber || '',
        address: patientData.address || '',
        bloodGroup: selectedBloodGroup,
        bloodGroupOther: selectedBloodGroup === 'Other' ? (patientData.bloodGroup || '') : '',
        allergies: patientData.allergies || '',
        chronicConditions: patientData.chronicConditions || '',
        emergencyContactName: patientData.emergencyContactName || '',
        emergencyContactPhone: digitsOnly(patientData.emergencyContactPhone || '', 10),
        referredBy: patientData.referredBy || ''
      });
      setShowEditModal(true);
    } catch (err) {
      console.error('Load patient for edit error:', err);
      setError('Error loading patient: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoadingHistory(false);
    }
  };

  const [forceDelete, setForceDelete] = useState(false);

  const handleDelete = async () => {
    if (!selectedPatient) return;
    
    try {
      setIsSubmitting(true);
      setError('');
      const response = await patientService.deletePatient(selectedPatient.id, forceDelete);
      console.log('✅ Delete patient response:', response);
      setSuccess('Patient deleted successfully!');
      setShowDeleteConfirm(false);
      setSelectedPatient(null);
      setForceDelete(false);
      // Force reload patients list after a short delay to ensure backend has processed
      setTimeout(() => {
        console.log('🔄 Reloading patients list after deletion...');
        loadPatients(appliedSearch);
      }, 500);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Delete patient error:', err);
      const errorMessage = err.response?.data?.message || err.message;
      const errorData = err.response?.data?.data || {};
      const canForceDelete = err.response?.data?.canForceDelete || false;
      
      if (errorMessage.includes('existing medical records')) {
        // Build detailed error message with record counts
        const recordDetails = [];
        if (errorData.appointments > 0) recordDetails.push(`${errorData.appointments} appointment(s)`);
        if (errorData.consultations > 0) recordDetails.push(`${errorData.consultations} consultation(s)`);
        if (errorData.prescriptions > 0) recordDetails.push(`${errorData.prescriptions} prescription(s)`);
        if (errorData.labTests > 0) recordDetails.push(`${errorData.labTests} lab test(s)`);
        if (errorData.bills > 0) recordDetails.push(`${errorData.bills} bill(s)`);
        if (errorData.admissions > 0) recordDetails.push(`${errorData.admissions} admission(s)`);
        if (errorData.inpatientBills > 0) recordDetails.push(`${errorData.inpatientBills} inpatient bill(s)`);
        if (errorData.dischargeSummaries > 0) recordDetails.push(`${errorData.dischargeSummaries} discharge summarie(s)`);
        
        const detailedMessage = recordDetails.length > 0 
          ? `Cannot delete patient with existing medical records: ${recordDetails.join(', ')}. ${canForceDelete ? 'You can force delete to remove all related records (use with caution).' : 'Please delete or archive these records first.'}`
          : errorMessage;
        
        setError(detailedMessage);
        
        // If force delete is available, show option to enable it
        if (canForceDelete && !forceDelete) {
          // Don't auto-enable, just show message
        }
      } else {
        setError('Error deleting patient: ' + errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteConfirm = (patient) => {
    setSelectedPatient(patient);
    setShowDeleteConfirm(true);
  };

  const closeModals = () => {
    setShowViewModal(false);
    setShowEditModal(false);
    setShowDeleteConfirm(false);
    setSelectedPatient(null);
    setPatientHistory(null);
    setPatientChronicConditions([]);
    setPatientAllergies([]);
    setSelectedConditions([]);
    setSelectedAllergies([]);
    setConditionSearchTerm('');
    setAllergySearchTerm('');
    setFormData({
      name: '',
      age: '',
      gender: 'MALE',
      phone: '',
      nationality: 'IN',
      aadharCardNumber: '',
      passportNumber: '',
      address: '',
      bloodGroup: '',
      bloodGroupOther: '',
      allergies: '',
      chronicConditions: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      referredBy: ''
    });
  };

  // Filter conditions based on search term
  const filteredConditions = conditionCatalog.filter(condition =>
    condition.name.toLowerCase().includes(conditionSearchTerm.toLowerCase()) ||
    condition.category.toLowerCase().includes(conditionSearchTerm.toLowerCase()) ||
    (condition.description && condition.description.toLowerCase().includes(conditionSearchTerm.toLowerCase()))
  );

  // Toggle condition selection
  const toggleCondition = (conditionId, event) => {
    if (event) {
      event.stopPropagation();
    }
    setSelectedConditions(prev => {
      if (prev.includes(conditionId)) {
        return prev.filter(id => id !== conditionId);
      } else {
        return [...prev, conditionId];
      }
    });
  };

  // Get selected condition names for display
  const getSelectedConditionNames = () => {
    return selectedConditions
      .map(id => conditionCatalog.find(c => c.id === id))
      .filter(Boolean)
      .map(c => c.name);
  };

  // Toggle allergy selection
  const toggleAllergy = (allergyId, event) => {
    if (event) {
      event.stopPropagation();
    }
    setSelectedAllergies(prev => {
      if (prev.includes(allergyId)) {
        return prev.filter(id => id !== allergyId);
      } else {
        return [...prev, allergyId];
      }
    });
  };

  // Get selected allergy names for display
  const getSelectedAllergyNames = () => {
    return selectedAllergies
      .map(id => allergyCatalog.find(a => a.id === id))
      .filter(Boolean)
      .map(a => a.name);
  };

  // Filter allergies based on search term
  const filteredAllergies = allergyCatalog.filter(allergy =>
    allergy.name.toLowerCase().includes(allergySearchTerm.toLowerCase()) ||
    allergy.category.toLowerCase().includes(allergySearchTerm.toLowerCase()) ||
    (allergy.description && allergy.description.toLowerCase().includes(allergySearchTerm.toLowerCase()))
  );

  if (loading && patients.length === 0) {
    return React.createElement(
      'div',
      { className: 'flex justify-center items-center h-64' },
      React.createElement(LoadingSpinner, { text: 'Loading patients...' })
    );
  }

  return React.createElement(
    'div',
    { style: { minHeight: '100vh', backgroundColor: '#F9FAFB', padding: '24px' } },
    React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', padding: '24px', marginBottom: '24px' } },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #E5E7EB' } },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement(
            'h1',
            { style: { fontSize: '20px', fontWeight: '600', color: '#111827', margin: 0 } },
            'Patient Management'
          ),
          React.createElement(InfoButton, {
            title: getInfoContent('patients').title,
            content: getInfoContent('patients').content,
            size: 'sm',
            variant: 'info'
          })
        )
      ),
      React.createElement(
        'div',
        {
          style: {
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#1E40AF',
          },
        },
        'New patient registration is done in ',
        React.createElement('strong', null, 'OPD Flow'),
        isViewOnly
          ? '. Here you can search and view existing patients.'
          : ' (Register & schedule). Here you can search, view, and edit existing patients.'
      ),

      // Search Bar
      React.createElement(
        'form',
        {
          className: 'flex space-x-4 mb-6',
          onSubmit: (e) => {
            e.preventDefault();
            runSearchNow();
          },
        },
        React.createElement(
          'input',
          {
            type: 'search',
            placeholder: 'Search patients...',
            value: searchTerm,
            onChange: (e) => setSearchTerm(e.target.value),
            className: 'flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
          }
        ),
        React.createElement(
          'button',
          {
            type: 'submit',
            className: 'bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500'
          },
          'Search'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => loadPatients(appliedSearch),
            className: 'bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          },
          'Refresh'
        )
      ),

      // Success/Error Display
      success && React.createElement(
        'div',
        { className: 'bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4' },
        success
      ),
      error && React.createElement(
        'div',
        { className: 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4' },
        error
      ),

      // Patients Table
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
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Name'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Age'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Gender'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Phone'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'ID (Aadhar/Passport)'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Blood Group'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Actions')
            )
          ),
          React.createElement(
            'tbody',
            { className: 'bg-white divide-y divide-gray-200' },
            patients.length === 0 ? React.createElement(
              'tr',
              null,
              React.createElement(
                'td',
                { colSpan: 7, className: 'px-6 py-4 text-center text-gray-500' },
                loading ? 'Loading...' : 'No patients found.'
              )
            ) : patients.map((patient, index) => React.createElement(
              'tr',
              { key: patient.id || index, className: 'hover:bg-gray-50' },
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' },
                patient.name || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                patient.age || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                patient.gender || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                patient.phone || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                patient.aadharCardNumber || patient.passportNumber || '-'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                patient.bloodGroup || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium' },
                React.createElement(
                  'button',
                  {
                    onClick: () => handleView(patient),
                    className: 'text-blue-600 hover:text-blue-900 mr-3 cursor-pointer',
                    style: { background: 'none', border: 'none', padding: 0, textDecoration: 'underline' }
                  },
                  'View'
                ),
                canEditPatients && React.createElement(
                  'button',
                  {
                    onClick: () => handleEdit(patient),
                    className: 'text-green-600 hover:text-green-900 mr-3 cursor-pointer',
                    style: { background: 'none', border: 'none', padding: 0, textDecoration: 'underline' }
                  },
                  'Edit'
                ),
                canDeletePatients && React.createElement(
                  'button',
                  {
                    onClick: () => openDeleteConfirm(patient),
                    className: 'text-red-600 hover:text-red-900 cursor-pointer',
                    style: { background: 'none', border: 'none', padding: 0, textDecoration: 'underline' }
                  },
                  'Delete'
                )
              )
            ))
          )
        )
      ),
      totalPages > 1 && React.createElement(
        'div',
        { className: 'mt-4 flex items-center justify-between border-t border-gray-200 pt-4' },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => setCurrentPage((page) => Math.max(1, page - 1)),
            disabled: currentPage === 1,
            className: 'px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
          },
          'Previous'
        ),
        React.createElement(
          'span',
          { className: 'text-sm text-gray-700' },
          `Page ${currentPage} of ${totalPages}`
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => setCurrentPage((page) => Math.min(totalPages, page + 1)),
            disabled: currentPage >= totalPages,
            className: 'px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
          },
          'Next'
        )
      ),

      // View Patient Modal
      showViewModal && selectedPatient && React.createElement(
        'div',
        {
          style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          },
          onClick: closeModals
        },
        React.createElement(
          'div',
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }
          },
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #E5E7EB' } },
            React.createElement('h2', { style: { fontSize: '24px', fontWeight: '600', margin: 0 } }, 'Patient Details'),
            React.createElement(
              'button',
              {
                onClick: closeModals,
                style: {
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6B7280',
                  padding: '0 8px'
                }
              },
              '×'
            )
          ),
          loadingHistory ? React.createElement(
            'div',
            { style: { textAlign: 'center', padding: '40px' } },
            React.createElement(LoadingSpinner, { text: 'Loading patient details...' })
          ) : React.createElement(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' } },
            React.createElement('div', null, React.createElement('strong', null, 'Name:'), ' ', selectedPatient.name),
            React.createElement('div', null, React.createElement('strong', null, 'Patient ID:'), ' ', selectedPatient.id || 'N/A'),
            React.createElement('div', null, React.createElement('strong', null, 'Age:'), ' ', selectedPatient.age),
            React.createElement('div', null, React.createElement('strong', null, 'Gender:'), ' ', selectedPatient.gender),
            React.createElement('div', null, React.createElement('strong', null, 'Phone:'), ' ', selectedPatient.phone),
            selectedPatient.aadharCardNumber ? React.createElement('div', null, React.createElement('strong', null, 'Aadhar Card:'), ' ', selectedPatient.aadharCardNumber) : null,
            selectedPatient.passportNumber ? React.createElement('div', null, React.createElement('strong', null, 'Passport Number:'), ' ', selectedPatient.passportNumber) : null,
            !selectedPatient.aadharCardNumber && !selectedPatient.passportNumber ? React.createElement('div', null, React.createElement('strong', null, 'ID:'), ' Not provided') : null,
            React.createElement('div', { style: { gridColumn: '1 / -1' } }, React.createElement('strong', null, 'Address:'), ' ', selectedPatient.address),
            React.createElement('div', null, React.createElement('strong', null, 'Blood Group:'), ' ', selectedPatient.bloodGroup || 'N/A'),
            React.createElement('div', null, React.createElement('strong', null, 'Patient Type:'), ' ', selectedPatient.patientType || 'OUTPATIENT'),
            selectedPatient.emergencyContactName && React.createElement('div', null, React.createElement('strong', null, 'Emergency Contact:'), ' ', selectedPatient.emergencyContactName, ' - ', selectedPatient.emergencyContactPhone),
            selectedPatient.referredBy && React.createElement('div', { style: { gridColumn: '1 / -1' } }, React.createElement('strong', null, 'Referred by:'), ' ', selectedPatient.referredBy)
          ),
          patientChronicConditions?.length > 0 && React.createElement(
            'div',
            { style: { marginTop: '16px', marginBottom: '24px', padding: '16px', backgroundColor: '#F9FAFB', borderRadius: '4px', border: '1px solid #E5E7EB' } },
            React.createElement('strong', { style: { display: 'block', marginBottom: '8px' } }, '🩺 Chronic Conditions/Medical History:'),
            React.createElement(
              'div',
              { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
              patientChronicConditions.map((patientCondition, idx) => React.createElement(
                'div',
                {
                  key: idx,
                  title: patientCondition.condition?.description || undefined,
                  style: {
                    padding: '6px 12px',
                    backgroundColor: '#E0E7FF',
                    borderRadius: '16px',
                    fontSize: '14px',
                    color: '#3730A3'
                  }
                },
                patientCondition.condition?.name || 'Unknown Condition',
                patientCondition.condition?.icdCode && React.createElement(
                  'span',
                  { style: { marginLeft: '6px', fontSize: '12px', color: '#6B7280' } },
                  `[${patientCondition.condition.icdCode}]`
                ),
                patientCondition.currentStatus && React.createElement(
                  'span',
                  { style: { marginLeft: '6px', fontSize: '12px', color: '#6B7280' } },
                  `(${patientCondition.currentStatus})`
                )
              ))
            )
          ),
          patientAllergies?.length > 0 && React.createElement(
            'div',
            { style: { marginTop: '16px', marginBottom: '24px', padding: '16px', backgroundColor: '#FEF3C7', borderRadius: '4px', border: '1px solid #FDE68A' } },
            React.createElement('strong', { style: { display: 'block', marginBottom: '8px' } }, '⚠️ Allergies:'),
            React.createElement(
              'div',
              { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
              patientAllergies.map((patientAllergy, idx) => React.createElement(
                'div',
                {
                  key: idx,
                  title: patientAllergy.allergy?.description || undefined,
                  style: {
                    padding: '6px 12px',
                    backgroundColor: '#FEF3C7',
                    borderRadius: '16px',
                    fontSize: '14px',
                    color: '#92400E',
                    border: '1px solid #FBBF24'
                  }
                },
                patientAllergy.allergy?.name || 'Unknown Allergy',
                patientAllergy.severity && React.createElement(
                  'span',
                  { style: { marginLeft: '6px', fontSize: '12px', color: '#B45309', fontWeight: 'bold' } },
                  `(${patientAllergy.severity})`
                )
              ))
            )
          ),
          React.createElement(
            'div',
            { style: { marginTop: '24px' } },
            React.createElement('h3', { style: { fontSize: '18px', fontWeight: '600', marginBottom: '16px' } }, '📋 Medical History'),
            React.createElement(
              'div',
              { style: { display: 'grid', gap: '16px' } },
              patientHistory?.appointments?.length > 0 && React.createElement(
                'div',
                { style: { border: '1px solid #E5E7EB', borderRadius: '4px', padding: '16px' } },
                React.createElement('h4', { style: { fontWeight: '600', marginBottom: '8px' } }, `📅 Appointments (${patientHistory.appointments.length})`),
                patientHistory.appointments.map((apt, idx) => React.createElement(
                  'div',
                  { key: idx, style: { padding: '8px', backgroundColor: '#F9FAFB', marginTop: '8px', borderRadius: '4px' } },
                  `${new Date(apt.date).toLocaleDateString()} ${apt.time} - ${apt.doctor?.fullName || 'N/A'} - Status: ${apt.status}`
                ))
              ),
              patientHistory?.consultations?.length > 0 && React.createElement(
                'div',
                { style: { border: '1px solid #E5E7EB', borderRadius: '4px', padding: '16px' } },
                React.createElement('h4', { style: { fontWeight: '600', marginBottom: '8px' } }, `🩺 Consultations (${patientHistory.consultations.length})`),
                patientHistory.consultations.map((cons, idx) => React.createElement(
                  'div',
                  { key: idx, style: { padding: '8px', backgroundColor: '#F9FAFB', marginTop: '8px', borderRadius: '4px' } },
                  `${new Date(cons.consultationDate).toLocaleDateString()} - Dr. ${cons.doctor?.fullName || 'N/A'}`,
                  cons.diagnosis && React.createElement('div', { style: { marginTop: '4px', fontSize: '14px', color: '#6B7280' } }, `Diagnosis: ${cons.diagnosis}`)
                ))
              ),
              patientHistory?.prescriptions?.length > 0 && React.createElement(
                'div',
                { style: { border: '1px solid #E5E7EB', borderRadius: '4px', padding: '16px' } },
                React.createElement('h4', { style: { fontWeight: '600', marginBottom: '8px' } }, `💊 Prescriptions (${patientHistory.prescriptions.length})`),
                patientHistory.prescriptions.map((pres, idx) => React.createElement(
                  'div',
                  { key: idx, style: { padding: '8px', backgroundColor: '#F9FAFB', marginTop: '8px', borderRadius: '4px' } },
                  `Prescription #${pres.prescriptionNumber} - ${new Date(pres.createdAt).toLocaleDateString()} - Dr. ${pres.doctor?.fullName || 'N/A'} - Status: ${pres.status}`
                ))
              ),
              patientHistory?.labTests?.length > 0 && React.createElement(
                'div',
                { style: { border: '1px solid #E5E7EB', borderRadius: '4px', padding: '16px' } },
                React.createElement('h4', { style: { fontWeight: '600', marginBottom: '8px' } }, `🧪 Lab Tests (${patientHistory.labTests.length})`),
                patientHistory.labTests.map((test, idx) => React.createElement(
                  'div',
                  { key: idx, style: { padding: '8px', backgroundColor: '#F9FAFB', marginTop: '8px', borderRadius: '4px' } },
                  `${test.testNameSnapshot || test.testCatalog?.testName} - ${new Date(test.createdAt).toLocaleDateString()} - Status: ${test.status}`
                ))
              ),
              (!patientHistory || (patientHistory.appointments?.length === 0 && patientHistory.consultations?.length === 0 && patientHistory.prescriptions?.length === 0 && patientHistory.labTests?.length === 0)) && patientChronicConditions?.length === 0 &&
              React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: '#6B7280' } }, 'No medical history available for this patient.')
            )
          )
        )
      ),

      // Edit Patient Modal
      showEditModal && selectedPatient && React.createElement(
        'div',
        {
          style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          },
          onClick: closeModals
        },
        React.createElement(
          'div',
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }
          },
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #E5E7EB' } },
            React.createElement('h2', { style: { fontSize: '24px', fontWeight: '600', margin: 0 } }, 'Edit Patient'),
            React.createElement(
              'button',
              {
                onClick: closeModals,
                style: {
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6B7280',
                  padding: '0 8px'
                }
              },
              '×'
            )
          ),
          React.createElement(
            'form',
            { onSubmit: handleSubmit, style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' } },
            React.createElement('input', {
              type: 'text',
              name: 'name',
              required: true,
              value: formData.name,
              onChange: handleInputChange,
              placeholder: 'Name *',
              className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            }),
            React.createElement('input', {
              type: 'text',
              inputMode: 'numeric',
              name: 'age',
              required: true,
              value: formData.age,
              onChange: handleInputChange,
              placeholder: 'Age *',
              maxLength: 3,
              className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            }),
            React.createElement(
              'select',
              {
                name: 'gender',
                required: true,
                value: formData.gender,
                onChange: handleInputChange,
                className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              },
              React.createElement('option', { value: 'MALE' }, 'Male'),
              React.createElement('option', { value: 'FEMALE' }, 'Female'),
              React.createElement('option', { value: 'OTHER' }, 'Other')
            ),
            React.createElement('input', {
              type: 'tel',
              name: 'phone',
              required: true,
              inputMode: 'numeric',
              value: formData.phone,
              onChange: handleInputChange,
              placeholder: 'Phone * (10 digits)',
              maxLength: 10,
              pattern: '[0-9]{10}',
              title: 'Phone number must be exactly 10 digits',
              className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            }),
            React.createElement(
              'select',
              {
                name: 'nationality',
                value: formData.nationality,
                onChange: (e) => {
                  handleInputChange(e);
                  if (e.target.value === 'IN') setFormData(prev => ({ ...prev, passportNumber: '' }));
                  else setFormData(prev => ({ ...prev, aadharCardNumber: '' }));
                },
                className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              },
              React.createElement('option', { value: 'IN' }, 'Indian (Aadhar)'),
              React.createElement('option', { value: 'FOREIGN' }, 'Foreign (Passport)')
            ),
            formData.nationality === 'IN' ? React.createElement('input', {
              type: 'text',
              inputMode: 'numeric',
              autoComplete: 'off',
              name: 'aadharCardNumber',
              value: formData.aadharCardNumber,
              onChange: handleInputChange,
              placeholder: 'Aadhar Card Number (12 digits only)',
              maxLength: 12,
              pattern: '[0-9]{12}',
              title: 'Aadhar card number must be exactly 12 digits',
              className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            }) : React.createElement('input', {
              type: 'text',
              name: 'passportNumber',
              value: formData.passportNumber,
              onChange: handleInputChange,
              placeholder: 'Passport Number',
              maxLength: 20,
              className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            }),
            React.createElement(
              'textarea',
              {
                name: 'address',
                required: true,
                rows: 2,
                value: formData.address,
                onChange: handleInputChange,
                placeholder: 'Address *',
                style: { gridColumn: '1 / -1' },
                className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              }
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'select',
                {
                  name: 'bloodGroup',
                  value: bloodGroupSelectValue(formData.bloodGroup),
                  onChange: (e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      bloodGroup: value,
                      bloodGroupOther: value === 'Other' ? prev.bloodGroupOther : '',
                    }));
                  },
                  className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                },
                React.createElement('option', { value: '' }, 'Select blood group'),
                BLOOD_GROUP_OPTIONS.map((option) =>
                  React.createElement(
                    'option',
                    { key: option, value: option },
                    option === 'N.A' ? 'N.A (not known)' : option === 'Other' ? 'Other (rare)' : option
                  )
                )
              ),
              formData.bloodGroup === 'Other'
                ? React.createElement('input', {
                    type: 'text',
                    name: 'bloodGroupOther',
                    value: formData.bloodGroupOther,
                    onChange: handleInputChange,
                    placeholder: 'Enter rare blood group',
                    maxLength: 20,
                    className: 'mt-2 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                  })
                : null
            ),
            React.createElement(
              'div',
              { style: { gridColumn: '1 / -1' } },
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700 mb-2' },
                'Medical History (Past Diseases/Chronic Conditions)'
              ),
              React.createElement(
                'div',
                { style: { marginBottom: '8px' } },
                React.createElement('input', {
                  type: 'text',
                  placeholder: 'Search diseases/conditions...',
                  value: conditionSearchTerm,
                  onChange: (e) => setConditionSearchTerm(e.target.value),
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                })
              ),
              React.createElement(
                'div',
                {
                  style: {
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    padding: '12px',
                    backgroundColor: '#FFFFFF'
                  }
                },
                filteredConditions.length === 0 ? React.createElement(
                  'div',
                  { style: { padding: '8px', color: '#6B7280', textAlign: 'center' } },
                  conditionSearchTerm ? 'No conditions found matching your search.' : 'Loading conditions...'
                ) : filteredConditions.map(condition => React.createElement(
                  'div',
                  {
                    key: condition.id,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      padding: '6px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: selectedConditions.includes(condition.id) ? '#DBEAFE' : 'transparent'
                    },
                    onClick: (e) => {
                      // Only toggle if click was not on the checkbox itself
                      if (e.target.type !== 'checkbox') {
                        e.stopPropagation();
                        toggleCondition(condition.id, e);
                      }
                    }
                  },
                  React.createElement('input', {
                    type: 'checkbox',
                    id: `edit-condition-${condition.id}`,
                    checked: selectedConditions.includes(condition.id),
                    onChange: (e) => {
                      e.stopPropagation();
                      toggleCondition(condition.id, e);
                    },
                    style: { cursor: 'pointer', pointerEvents: 'auto' }
                  }),
                  React.createElement(
                    'label',
                    {
                      htmlFor: `edit-condition-${condition.id}`,
                      title: condition.description || undefined,
                      style: { cursor: 'pointer', flex: 1, fontSize: '14px' }
                    },
                    condition.name,
                    React.createElement(
                      'span',
                      { style: { color: '#6B7280', fontSize: '12px', marginLeft: '8px' } },
                      `(${condition.category})`
                    )
                )
              ))
            ),
            selectedConditions.length > 0 && React.createElement(
              'div',
              { style: { marginTop: '8px', padding: '8px', backgroundColor: '#F3F4F6', borderRadius: '4px' } },
              React.createElement(
                'small',
                { style: { color: '#374151', fontWeight: '500' } },
                `${selectedConditions.length} condition(s) selected: `,
                getSelectedConditionNames().join(', ')
              )
            )
          ),
          React.createElement(
            'div',
            { style: { gridColumn: '1 / -1' } },
            React.createElement(
              'label',
              { className: 'block text-sm font-medium text-gray-700 mb-2' },
              'Allergies (From Catalog)'
            ),
            React.createElement(
              'div',
              { style: { marginBottom: '8px' } },
              React.createElement('input', {
                type: 'text',
                placeholder: 'Search allergies...',
                value: allergySearchTerm,
                onChange: (e) => setAllergySearchTerm(e.target.value),
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              })
            ),
            React.createElement(
              'div',
              {
                style: {
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  padding: '12px',
                  backgroundColor: '#FFFFFF'
                }
              },
              filteredAllergies.length === 0 ? React.createElement(
                'div',
                { style: { padding: '8px', color: '#6B7280', textAlign: 'center' } },
                allergySearchTerm ? 'No allergies found matching your search.' : 'Loading allergies...'
              ) : filteredAllergies.map(allergy => React.createElement(
                'div',
                {
                  key: allergy.id,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    padding: '6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: selectedAllergies.includes(allergy.id) ? '#DBEAFE' : 'transparent'
                  },
                  onClick: (e) => {
                    // Only toggle if click was not on the checkbox itself
                    if (e.target.type !== 'checkbox') {
                      e.stopPropagation();
                      toggleAllergy(allergy.id, e);
                    }
                  }
                },
                React.createElement('input', {
                  type: 'checkbox',
                  id: `edit-allergy-${allergy.id}`,
                  checked: selectedAllergies.includes(allergy.id),
                  onChange: (e) => {
                    e.stopPropagation();
                    toggleAllergy(allergy.id, e);
                  },
                  style: { cursor: 'pointer', pointerEvents: 'auto' }
                }),
                React.createElement(
                  'label',
                  {
                    htmlFor: `edit-allergy-${allergy.id}`,
                    title: allergy.description || undefined,
                    style: { cursor: 'pointer', flex: 1, fontSize: '14px' }
                  },
                  allergy.name,
                  React.createElement(
                    'span',
                    { style: { color: '#6B7280', fontSize: '12px', marginLeft: '8px' } },
                    `(${allergy.category})`
                  )
                )
              ))
            ),
            selectedAllergies.length > 0 && React.createElement(
              'div',
              { style: { marginTop: '8px', padding: '8px', backgroundColor: '#F3F4F6', borderRadius: '4px' } },
              React.createElement(
                'small',
                { style: { color: '#374151', fontWeight: '500' } },
                `${selectedAllergies.length} allergy/allergies selected: `,
                getSelectedAllergyNames().join(', ')
              )
            )
          ),
            React.createElement(
              'div',
              { style: { gridColumn: '1 / -1' } },
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700' },
                'Referred by (optional)'
              ),
              React.createElement('input', {
                type: 'text',
                name: 'referredBy',
                value: formData.referredBy,
                onChange: handleInputChange,
                placeholder: 'Name of person who referred this patient',
                maxLength: 200,
                className: 'mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
              })
            ),
            React.createElement('input', {
              type: 'text',
              name: 'emergencyContactName',
              value: formData.emergencyContactName,
              onChange: handleInputChange,
              placeholder: 'Emergency Contact Name',
              className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            }),
            React.createElement('input', {
              type: 'tel',
              name: 'emergencyContactPhone',
              inputMode: 'numeric',
              value: formData.emergencyContactPhone,
              onChange: handleInputChange,
              placeholder: 'Emergency Contact Phone (10 digits)',
              maxLength: 10,
              className: 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            }),
            React.createElement(
              'div',
              { style: { gridColumn: '1 / -1', display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' } },
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: closeModals,
                  className: 'px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50',
                  disabled: isSubmitting
                },
                'Cancel'
              ),
              React.createElement(
                'button',
                {
                  type: 'submit',
                  disabled: isSubmitting,
                  className: 'bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400'
                },
                isSubmitting ? 'Saving...' : 'Save Changes'
              )
            )
          )
        )
      ),

      // Delete Confirmation Modal
      showDeleteConfirm && selectedPatient && React.createElement(
        'div',
        {
          style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          },
          onClick: closeModals
        },
        React.createElement(
          'div',
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }
          },
          React.createElement('h2', { style: { fontSize: '20px', fontWeight: '600', marginBottom: '16px' } }, 'Confirm Delete'),
          React.createElement('p', { style: { marginBottom: '16px', color: '#6B7280' } },
            `Are you sure you want to delete patient "${selectedPatient.name}"? This action cannot be undone.`
          ),
          error && React.createElement(
            'div',
            { 
              style: { 
                marginBottom: '16px', 
                padding: '12px', 
                backgroundColor: '#FEF2F2', 
                border: '1px solid #FECACA', 
                borderRadius: '4px',
                color: '#991B1B',
                fontSize: '14px'
              } 
            },
            React.createElement('div', { style: { marginBottom: error.includes('force delete') ? '12px' : '0' } }, error),
            error.includes('force delete') && React.createElement(
              'div',
              { style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #FECACA' } },
              React.createElement(
                'label',
                { 
                  style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    cursor: 'pointer'
                  } 
                },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: forceDelete,
                  onChange: (e) => setForceDelete(e.target.checked),
                  style: { cursor: 'pointer', width: '16px', height: '16px' }
                }),
                React.createElement('span', { style: { fontWeight: '500' } }, 
                  '⚠️ Force delete (will permanently delete ALL related medical records - USE WITH CAUTION)'
                )
              )
            )
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
            React.createElement(
              'button',
              {
                onClick: closeModals,
                className: 'px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50',
                disabled: isSubmitting
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                onClick: handleDelete,
                disabled: isSubmitting,
                className: 'bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 disabled:bg-gray-400'
              },
              isSubmitting ? 'Deleting...' : 'Delete Patient'
            )
          )
        )
      )
    )
  );
};

export default PatientManagement;