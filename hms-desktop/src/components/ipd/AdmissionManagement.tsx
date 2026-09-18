import React, { useState, useEffect } from 'react';
import admissionService from '../../lib/api/services/admissionService';
import wardService from '../../lib/api/services/wardService';
import bedService from '../../lib/api/services/bedService';
import patientService from '../../lib/api/services/patientService';
import { useHospitalConfig } from '../../lib/contexts/HospitalConfigContext';
import { fetchAllPages } from '../../lib/utils/fetchAllPages';

const AdmissionManagement = ({ onBack, isAuthenticated }) => {
  const { formatCurrency } = useHospitalConfig();
  const [admissions, setAdmissions] = useState([]);
  const [wards, setWards] = useState([]);
  const [availableBeds, setAvailableBeds] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDischargeForm, setShowDischargeForm] = useState(false);
  const [editingAdmission, setEditingAdmission] = useState(null);
  const [dischargingAdmission, setDischargingAdmission] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWard, setFilterWard] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Form states
  const [formData, setFormData] = useState({
    patientId: '',
    wardId: '',
    bedId: '',
    admissionDate: new Date().toISOString().split('T')[0],
    admissionType: 'EMERGENCY',
    admissionReason: '',
    notes: '',
    // Day care specific fields
    isDayCare: false,
    procedureStartTime: '',
    expectedDischargeTime: '',
    homeSupportAvailable: false
  });

  const [dischargeData, setDischargeData] = useState({
    dischargeNotes: ''
  });

  const admissionTypes = [
    { value: 'EMERGENCY', label: 'Emergency Admission', icon: '🚨' },
    { value: 'PLANNED', label: 'Planned Admission', icon: '📅' },
    { value: 'TRANSFER', label: 'Transfer from Another Ward', icon: '🔄' },
    { value: 'OBSERVATION', label: 'Observation', icon: '👁️' },
    { value: 'DAY_CARE', label: 'Day Care (Same-Day Surgery)', icon: '🏥' }
  ];

  const admissionStatuses = [
    { value: 'ADMITTED', label: 'Admitted', icon: '🏥', color: '#007bff' },
    { value: 'DISCHARGED', label: 'Discharged', icon: '✅', color: '#28a745' },
    { value: 'TRANSFERRED', label: 'Transferred', icon: '🔄', color: '#ffc107' }
  ];

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterWard, filterStatus, filterType]);

  useEffect(() => {
    if (isAuthenticated) {
      loadWards();
      loadPatients();
      loadAdmissions();
    } else {
      setError('Please login to access admission management');
    }
  }, [isAuthenticated, searchTerm, filterWard, filterStatus, filterType, currentPage]);

  useEffect(() => {
    if (formData.wardId) {
      loadAvailableBeds(formData.wardId);
    }
  }, [formData.wardId]);

  const loadWards = async () => {
    try {
      console.log('🏥 Loading wards for admission form...');
      const wardsList = await fetchAllPages(async (page, limit) => {
        const response = await wardService.getWards({ page, limit });
        const items = response?.wards || response?.data?.wards || (Array.isArray(response) ? response : []);
        return { items, totalPages: response?.pagination?.totalPages || response?.data?.pagination?.totalPages };
      });
      console.log(`✅ Loaded ${wardsList.length} wards`);
      setWards(wardsList);
    } catch (err) {
      console.error('❌ Error loading wards:', err);
      console.error('❌ Error response:', err.response?.data);
      setWards([]); // Set empty array on error
    }
  };

  const loadPatients = async () => {
    try {
      console.log('👥 Loading patients for admission form...');
      const patientsList = await fetchAllPages(async (page, limit) => {
        const response = await patientService.getPatients({ page, limit });
        const items = response?.patients || response?.data?.patients || (Array.isArray(response) ? response : []);
        return { items, totalPages: response?.pagination?.totalPages || response?.data?.pagination?.totalPages };
      });
      console.log(`✅ Loaded ${patientsList.length} patients`);
      setPatients(patientsList);
    } catch (err) {
      console.error('❌ Error loading patients:', err);
      console.error('❌ Error response:', err.response?.data);
      setPatients([]); // Set empty array on error
    }
  };

  const loadAvailableBeds = async (wardId) => {
    if (!wardId) {
      setAvailableBeds([]);
      return;
    }
    
    try {
      console.log(`🛏️ Loading available beds for ward: ${wardId}`);
      const response = await bedService.getAvailableBeds({ wardId });
      console.log(`📋 Bed service response:`, response);
      
      // Handle different response structures
      let bedsList = [];
      if (response && Array.isArray(response)) {
        bedsList = response;
      } else if (response && response.beds && Array.isArray(response.beds)) {
        bedsList = response.beds;
      } else if (response && response.data && response.data.beds && Array.isArray(response.data.beds)) {
        bedsList = response.data.beds;
      }
      
      console.log(`✅ Loaded ${bedsList.length} available beds`);
      setAvailableBeds(bedsList);
      
      if (bedsList.length === 0) {
        console.warn(`⚠️ No available beds found for ward ${wardId}`);
        // Don't show error here, just log - user can still proceed if they have bed IDs
      }
    } catch (err) {
      console.error('❌ Error loading available beds:', err);
      console.error('❌ Bed service error:', err.response?.data || err.message);
      setAvailableBeds([]);
      // Don't set error here - it's just a warning, not a blocker
    }
  };

  const loadAdmissions = async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: 20,
        ...(searchTerm && { search: searchTerm }),
        ...(filterWard && { wardId: filterWard }),
        ...(filterStatus && { status: filterStatus }),
        ...(filterType && { admissionType: filterType })
      };
      
      console.log('📋 Loading admissions with params:', params);
      const response = await admissionService.getAdmissions(params);
      console.log('📋 Admission service response:', response);
      
      // Handle different response structures
      let admissionsList = [];
      if (response && response.admissions) {
        admissionsList = Array.isArray(response.admissions) ? response.admissions : [];
      } else if (response && response.data && response.data.admissions) {
        admissionsList = Array.isArray(response.data.admissions) ? response.data.admissions : [];
      } else if (Array.isArray(response)) {
        admissionsList = response;
      }
      
      console.log(`✅ Loaded ${admissionsList.length} admissions`);
      setAdmissions(admissionsList);
      const nextTotalPages = Math.max(1, response?.pagination?.totalPages || response?.data?.pagination?.totalPages || 1);
      setTotalPages(nextTotalPages);
      if (currentPage > nextTotalPages) {
        setCurrentPage(nextTotalPages);
      }
      setError('');
    } catch (err) {
      console.error('❌ Error loading admissions:', err);
      console.error('❌ Error response:', err.response?.data);
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to load admissions';
        setError(`❌ ${errorMsg}`);
      }
      setAdmissions([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      // Auto-set isDayCare when DAY_CARE is selected
      ...(name === 'admissionType' && value === 'DAY_CARE' ? { isDayCare: true } : {}),
      ...(name === 'admissionType' && value !== 'DAY_CARE' ? { isDayCare: false } : {})
    }));
  };

  const handleDischargeInputChange = (e) => {
    const { name, value } = e.target;
    setDischargeData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate required fields
    if (!formData.patientId) {
      setError('❌ Please select a patient');
      setLoading(false);
      return;
    }
    if (!formData.wardId) {
      setError('❌ Please select a ward');
      setLoading(false);
      return;
    }
    if (!formData.bedId) {
      setError('❌ Please select a bed');
      setLoading(false);
      return;
    }
    if (!formData.admissionReason || formData.admissionReason.trim() === '') {
      setError('❌ Please enter admission reason');
      setLoading(false);
      return;
    }

    try {
      console.log('📝 Submitting admission data:', {
        patientId: formData.patientId,
        wardId: formData.wardId,
        bedId: formData.bedId,
        admissionDate: formData.admissionDate,
        admissionType: formData.admissionType,
        admissionReason: formData.admissionReason?.substring(0, 50) + '...',
      });
      
      // Day care validation
      const isDayCare = formData.admissionType === 'DAY_CARE';
      if (isDayCare) {
        if (!formData.procedureStartTime) {
          setError('❌ Please enter procedure start time for day care admission');
          setLoading(false);
          return;
        }
        if (!formData.expectedDischargeTime) {
          setError('❌ Please enter expected discharge time for day care admission');
          setLoading(false);
          return;
        }
        if (!formData.homeSupportAvailable) {
          setError('❌ Day care patients must have home support available');
          setLoading(false);
          return;
        }
      }

      const admissionData = {
        patientId: formData.patientId,
        wardId: formData.wardId,
        bedId: formData.bedId,
        admissionDate: formData.admissionDate,
        admissionType: formData.admissionType,
        admissionReason: formData.admissionReason.trim(),
        notes: formData.notes?.trim() || undefined,
        // Day care specific fields
        isDayCare: isDayCare,
        procedureStartTime: isDayCare && formData.procedureStartTime 
          ? new Date(`${formData.admissionDate}T${formData.procedureStartTime}`).toISOString() 
          : undefined,
        expectedDischargeTime: isDayCare && formData.expectedDischargeTime 
          ? new Date(`${formData.admissionDate}T${formData.expectedDischargeTime}`).toISOString() 
          : undefined,
        homeSupportAvailable: isDayCare ? formData.homeSupportAvailable : undefined
      };

      if (showEditForm && editingAdmission) {
        const updated = await admissionService.updateAdmission(editingAdmission.id, admissionData);
        console.log('✅ Admission updated:', updated);
        setShowEditForm(false);
        setEditingAdmission(null);
        setError('✅ Admission updated successfully!');
      } else {
        const created = await admissionService.createAdmission(admissionData);
        console.log('✅ Admission created:', created);
        setShowAddForm(false);
        setError('✅ Patient admitted successfully!');
      }

      // Reload all data
      await Promise.all([
        loadAdmissions(),
        loadWards(),
        formData.wardId && loadAvailableBeds(formData.wardId)
      ]);

      // Reset form
      setFormData({
        patientId: '',
        wardId: '',
        bedId: '',
        admissionDate: new Date().toISOString().split('T')[0],
        admissionType: 'EMERGENCY',
        admissionReason: '',
        notes: '',
        isDayCare: false,
        procedureStartTime: '',
        expectedDischargeTime: '',
        homeSupportAvailable: false
      });

    } catch (err) {
      console.error('❌ Error saving admission:', err);
      console.error('❌ Error response:', err.response?.data);
      console.error('❌ Error details:', {
        status: err.response?.status,
        message: err.response?.data?.message,
        errors: err.response?.data?.errors,
        data: err.response?.data?.data
      });
      
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else if (err.response?.data?.message) {
        // Show detailed error message
        let errorMsg = err.response.data.message;
        
        // Add validation errors if present
        if (err.response.data.errors && Array.isArray(err.response.data.errors)) {
          const validationErrors = err.response.data.errors
            .map(e => `${e.path?.join('.') || 'Field'}: ${e.message}`)
            .join(', ');
          if (validationErrors) {
            errorMsg += ` (${validationErrors})`;
          }
        }
        
        // Add additional data if present (e.g., existing admission)
        if (err.response.data.data) {
          const dataInfo = err.response.data.data;
          if (dataInfo.existingAdmission) {
            errorMsg += ' This patient is already admitted.';
          } else if (dataInfo.charges) {
            errorMsg += ` Pending charges: ${formatCurrency(dataInfo.charges.totalAmount || 0)}`;
          }
        }
        
        setError(`❌ ${errorMsg}`);
      } else if (err.message) {
        setError(`❌ ${err.message}`);
      } else {
        setError('❌ Failed to save admission. Please check the console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDischarge = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await admissionService.dischargePatient(dischargingAdmission.id, dischargeData.dischargeNotes);
      setShowDischargeForm(false);
      setDischargingAdmission(null);
      setError('✅ Patient discharged successfully!');
      await loadAdmissions();

      // Reset discharge form
      setDischargeData({ dischargeNotes: '' });

    } catch (err) {
      console.error('Error discharging patient:', err);
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else if (err.response?.data?.message) {
        setError(`❌ ${err.response.data.message}`);
      } else {
        setError('❌ Failed to discharge patient. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (admission) => {
    setEditingAdmission(admission);
    setFormData({
      patientId: admission.patientId || '',
      wardId: admission.wardId || '',
      bedId: admission.bedId || '',
      admissionDate: admission.admissionDate ? new Date(admission.admissionDate).toISOString().split('T')[0] : '',
      admissionType: admission.admissionType || 'EMERGENCY',
      admissionReason: admission.admissionReason || '',
      notes: admission.notes || ''
    });
    setShowEditForm(true);
    setShowAddForm(false);
  };

  const handleDischargeClick = (admission) => {
    setDischargingAdmission(admission);
    setDischargeData({ dischargeNotes: '' });
    setShowDischargeForm(true);
  };

  const getAdmissionTypeInfo = (type) => {
    return admissionTypes.find(t => t.value === type) || { value: type, label: type, icon: '🏥' };
  };

  const getAdmissionStatusInfo = (status) => {
    return admissionStatuses.find(s => s.value === status) || { value: status, label: status, icon: '❓', color: '#6c757d' };
  };

  const getPatientName = (admissionOrPatientId) => {
    if (admissionOrPatientId && typeof admissionOrPatientId === 'object') {
      if (admissionOrPatientId.patient?.name) return admissionOrPatientId.patient.name;
      const linked = patients.find((p) => p.id === admissionOrPatientId.patientId);
      return linked?.name || 'Unknown Patient';
    }
    const patient = patients.find((p) => p.id === admissionOrPatientId);
    return patient?.name || 'Unknown Patient';
  };

  const getWardName = (wardId) => {
    const ward = wards.find(w => w.id === wardId);
    return ward ? ward.name : 'Unknown Ward';
  };

  const getBedNumber = (bedId) => {
    if (!bedId) return 'Unknown Bed';
    
    try {
      // First try to find in available beds
      let bed = availableBeds.find(b => b && b.id === bedId);
      
      if (bed && bed.bedNumber) {
        return bed.bedNumber;
      }
      
      // If not found, try to find in admissions (which have bed info)
      if (!bed && Array.isArray(admissions)) {
        const admission = admissions.find(a => a && a.bedId === bedId);
        if (admission && admission.bed && admission.bed.bedNumber) {
          return admission.bed.bedNumber;
        }
      }
      
      return bed?.bedNumber || 'Unknown Bed';
    } catch (err) {
      console.error('Error getting bed number:', err);
      return 'Unknown Bed';
    }
  };

  const filteredAdmissions = (() => {
    try {
      if (!Array.isArray(admissions)) {
        return [];
      }
      
      return admissions.filter(admission => {
        if (!admission || typeof admission !== 'object') return false;
        
        try {
          const patientName = getPatientName(admission);
          const matchesSearch = patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               (admission.admissionReason && admission.admissionReason.toLowerCase().includes(searchTerm.toLowerCase())) ||
                               (admission.notes && admission.notes.toLowerCase().includes(searchTerm.toLowerCase()));
          
          const matchesWard = !filterWard || admission.wardId === filterWard;
          const matchesStatus = !filterStatus || admission.status === filterStatus;
          const matchesType = !filterType || admission.admissionType === filterType;
          
          return matchesSearch && matchesWard && matchesStatus && matchesType;
        } catch (err) {
          console.error('Error filtering admission:', err, admission);
          return false;
        }
      });
    } catch (err) {
      console.error('Error in filteredAdmissions:', err);
      return [];
    }
  })();

  const stats = (() => {
    try {
      const admissionsList = Array.isArray(admissions) ? admissions : [];
      return {
        totalAdmissions: admissionsList.length,
        currentAdmissions: admissionsList.filter(a => a && a.status === 'ADMITTED').length,
        dischargedAdmissions: admissionsList.filter(a => a && a.status === 'DISCHARGED').length,
        emergencyAdmissions: admissionsList.filter(a => a && a.admissionType === 'EMERGENCY').length
      };
    } catch (err) {
      console.error('Error calculating stats:', err);
      return {
        totalAdmissions: 0,
        currentAdmissions: 0,
        dischargedAdmissions: 0,
        emergencyAdmissions: 0
      };
    }
  })();

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
          'h1',
          { style: { fontSize: '16px', fontWeight: '600', color: '#000000', margin: 0 } },
          '🏥 Admission Management'
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
          '+ Admit Patient'
        )
      )
    ),

    // Content
    React.createElement(
      'div',
      { style: { padding: '20px' } },

      // Statistics Cards
      React.createElement(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }
          },
          React.createElement(
            'div',
            { style: { fontSize: '24px', marginBottom: '8px' } },
            '🏥'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', fontWeight: 'bold', color: '#007bff' } },
            stats.totalAdmissions
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Total Admissions'
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }
          },
          React.createElement(
            'div',
            { style: { fontSize: '24px', marginBottom: '8px' } },
            '👥'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', fontWeight: 'bold', color: '#ffc107' } },
            stats.currentAdmissions
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Current Admissions'
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }
          },
          React.createElement(
            'div',
            { style: { fontSize: '24px', marginBottom: '8px' } },
            '✅'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', fontWeight: 'bold', color: '#28a745' } },
            stats.dischargedAdmissions
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Discharged'
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              textAlign: 'center'
            }
          },
          React.createElement(
            'div',
            { style: { fontSize: '24px', marginBottom: '8px' } },
            '🚨'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', fontWeight: 'bold', color: '#dc3545' } },
            stats.emergencyAdmissions
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Emergency Admissions'
          )
        )
      ),

      // Search and Filters
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px',
              alignItems: 'end'
            }
          },
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Search Admissions'
            ),
            React.createElement('input', {
              type: 'text',
              placeholder: 'Search by patient name, reason, or notes...',
              value: searchTerm,
              onChange: (e) => setSearchTerm(e.target.value),
              style: {
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }
            })
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Filter by Ward'
            ),
            React.createElement(
              'select',
              {
                value: filterWard,
                onChange: (e) => setFilterWard(e.target.value),
                style: {
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: '' }, 'All Wards'),
              ...wards.map(ward => React.createElement(
                'option',
                { key: ward.id, value: ward.id },
                ward.name
              ))
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Filter by Status'
            ),
            React.createElement(
              'select',
              {
                value: filterStatus,
                onChange: (e) => setFilterStatus(e.target.value),
                style: {
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: '' }, 'All Status'),
              ...admissionStatuses.map(status => React.createElement(
                'option',
                { key: status.value, value: status.value },
                `${status.icon} ${status.label}`
              ))
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Filter by Type'
            ),
            React.createElement(
              'select',
              {
                value: filterType,
                onChange: (e) => setFilterType(e.target.value),
                style: {
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: '' }, 'All Types'),
              ...admissionTypes.map(type => React.createElement(
                'option',
                { key: type.value, value: type.value },
                `${type.icon} ${type.label}`
              ))
            )
          )
        )
      ),

      // Error/Success Message
      error && React.createElement(
        'div',
        {
          style: {
            backgroundColor: error.includes('✅') ? '#d4edda' : '#f8d7da',
            color: error.includes('✅') ? '#155724' : '#721c24',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '20px',
            border: `1px solid ${error.includes('✅') ? '#c3e6cb' : '#f5c6cb'}`
          }
        },
        error
      ),

      // Admissions Table
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              padding: '20px',
              borderBottom: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }
          },
          React.createElement(
            'h3',
            { style: { margin: '0', color: '#333' } },
            `Admissions (${filteredAdmissions.length})`
          ),
          loading && React.createElement(
            'div',
            { style: { color: '#007bff' } },
            'Loading...'
          )
        ),
        React.createElement(
          'div',
          { style: { overflowX: 'auto' } },
          React.createElement(
            'table',
            {
              style: {
                width: '100%',
                borderCollapse: 'collapse'
              }
            },
            React.createElement(
              'thead',
              {
                style: {
                  backgroundColor: '#f8f9fa',
                  borderBottom: '2px solid #dee2e6'
                }
              },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: 'bold' } }, 'Patient'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: 'bold' } }, 'Ward/Bed'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: 'bold' } }, 'Admission Type'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: 'bold' } }, 'Admission Date'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: 'bold' } }, 'Status'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: 'bold' } }, 'Reason'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'center', fontWeight: 'bold' } }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              null,
              filteredAdmissions.length === 0 ? React.createElement(
                'tr',
                null,
                React.createElement(
                  'td',
                  { colSpan: 7, style: { padding: '40px', textAlign: 'center', color: '#666' } },
                  'No admissions found matching your criteria.'
                )
              ) : filteredAdmissions.map((admission, index) => {
                if (!admission || !admission.id) {
                  console.warn('Invalid admission object:', admission);
                  return null;
                }
                
                try {
                  const typeInfo = getAdmissionTypeInfo(admission.admissionType);
                  const statusInfo = getAdmissionStatusInfo(admission.status);
                  const patientName = getPatientName(admission);
                  const wardName = getWardName(admission.wardId);
                  const bedNumber = getBedNumber(admission.bedId);
                
                return React.createElement(
                  'tr',
                  {
                    key: admission.id,
                    style: {
                      borderBottom: '1px solid #dee2e6',
                      backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa'
                    }
                  },
                  React.createElement(
                    'td',
                    { style: { padding: '12px' } },
                    React.createElement(
                      'div',
                      { style: { fontWeight: 'bold', color: '#333' } },
                      patientName
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px' } },
                    React.createElement(
                      'div',
                      null,
                      React.createElement(
                        'div',
                        { style: { fontWeight: 'bold' } },
                        `🏥 ${wardName}`
                      ),
                      React.createElement(
                        'div',
                        { style: { fontSize: '12px', color: '#666' } },
                        `🛏️ Bed ${bedNumber}`
                      )
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px' } },
                    React.createElement(
                      'span',
                      {
                        style: {
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          backgroundColor: '#f8f9fa',
                          color: '#495057',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }
                      },
                      `${typeInfo.icon} ${typeInfo.label}`
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px' } },
                    admission.admissionDate ? new Date(admission.admissionDate).toLocaleDateString() : '-'
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px' } },
                    React.createElement(
                      'span',
                      {
                        style: {
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: statusInfo.color + '20',
                          color: statusInfo.color
                        }
                      },
                      `${statusInfo.icon} ${statusInfo.label}`
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px', maxWidth: '200px' } },
                    React.createElement(
                      'div',
                      { 
                        style: { 
                          fontSize: '12px', 
                          color: '#666',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        },
                        title: admission.admissionReason
                      },
                      admission.admissionReason
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px', textAlign: 'center' } },
                    React.createElement(
                      'div',
                      {
                        style: {
                          display: 'flex',
                          gap: '5px',
                          justifyContent: 'center',
                          flexWrap: 'wrap'
                        }
                      },
                      React.createElement(
                        'button',
                        {
                          onClick: () => handleEdit(admission),
                          style: {
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }
                        },
                        '✏️ Edit'
                      ),
                      admission.status === 'ADMITTED' && React.createElement(
                        'button',
                        {
                          onClick: () => handleDischargeClick(admission),
                          style: {
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }
                        },
                        '✅ Discharge'
                      )
                    )
                  )
                  );
                } catch (err) {
                  console.error('❌ Error rendering admission row:', err, admission);
                  return React.createElement(
                    'tr',
                    { key: admission.id || index },
                    React.createElement(
                      'td',
                      { colSpan: 7, style: { padding: '12px', color: '#dc3545' } },
                      `Error displaying admission: ${err.message}`
                    )
                  );
                }
              }).filter(Boolean) // Remove null entries
            )
          )
        )
      )
    ),
    totalPages > 1 && React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8' } },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setCurrentPage((page) => Math.max(1, page - 1)),
          disabled: currentPage === 1,
          style: { padding: '6px 12px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }
        },
        'Previous'
      ),
      React.createElement('span', { style: { fontSize: '13px' } }, `Page ${currentPage} of ${totalPages}`),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setCurrentPage((page) => Math.min(totalPages, page + 1)),
          disabled: currentPage >= totalPages,
          style: { padding: '6px 12px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }
        },
        'Next'
      )
    ),

    // Add/Edit Admission Modal
    (showAddForm || showEditForm) && React.createElement(
      'div',
      {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }
      },
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }
        },
        // Close button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              setShowAddForm(false);
              setShowEditForm(false);
              setEditingAdmission(null);
              setFormData({
                patientId: '',
                wardId: '',
                bedId: '',
                admissionType: 'PLANNED',
                admissionDate: new Date().toISOString().split('T')[0],
                expectedDischargeDate: '',
                reason: '',
                notes: ''
              });
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
          'h3',
          { style: { margin: '0 0 20px 0', color: '#333', paddingRight: '32px' } },
          showEditForm ? '✏️ Edit Admission' : '➕ Admit Patient'
        ),
        React.createElement(
          'form',
          { onSubmit: handleSubmit },
          React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '15px',
                marginBottom: '15px'
              }
            },
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
                'Patient *'
              ),
              React.createElement(
                'select',
                {
                  name: 'patientId',
                  required: true,
                  value: formData.patientId,
                  onChange: handleInputChange,
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }
                },
                React.createElement('option', { value: '' }, 'Select Patient'),
                ...patients.map(patient => React.createElement(
                  'option',
                  { key: patient.id, value: patient.id },
                  `${patient.name} (${patient.phone})`
                ))
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
                'Admission Date *'
              ),
              React.createElement('input', {
                type: 'date',
                name: 'admissionDate',
                required: true,
                value: formData.admissionDate,
                onChange: handleInputChange,
                style: {
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              })
            )
          ),
          React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '15px',
                marginBottom: '15px'
              }
            },
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
                'Ward *'
              ),
              React.createElement(
                'select',
                {
                  name: 'wardId',
                  required: true,
                  value: formData.wardId,
                  onChange: handleInputChange,
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }
                },
                React.createElement('option', { value: '' }, 'Select Ward'),
                ...wards.map(ward => React.createElement(
                  'option',
                  { key: ward.id, value: ward.id },
                  ward.name
                ))
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
                'Bed *'
              ),
              React.createElement(
                'select',
                {
                  name: 'bedId',
                  required: true,
                  value: formData.bedId,
                  onChange: handleInputChange,
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }
                },
                React.createElement('option', { value: '' }, 'Select Bed'),
                ...availableBeds.map(bed => React.createElement(
                  'option',
                  { key: bed.id, value: bed.id },
                  `Bed ${bed.bedNumber} (${bed.bedType})`
                ))
              )
            )
          ),
          React.createElement(
            'div',
            { style: { marginBottom: '15px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Admission Type *'
            ),
            React.createElement(
              'select',
              {
                name: 'admissionType',
                required: true,
                value: formData.admissionType,
                onChange: handleInputChange,
                style: {
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              ...admissionTypes.map(type => React.createElement(
                'option',
                { key: type.value, value: type.value },
                `${type.icon} ${type.label}`
              ))
            )
          ),
          React.createElement(
            'div',
            { style: { marginBottom: '15px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Admission Reason *'
            ),
            React.createElement('textarea', {
              name: 'admissionReason',
              required: true,
              rows: 3,
              value: formData.admissionReason,
              onChange: handleInputChange,
              style: {
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical'
              }
            })
          ),
          React.createElement(
            'div',
            { style: { marginBottom: '20px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Notes'
            ),
            React.createElement('textarea', {
              name: 'notes',
              rows: 3,
              value: formData.notes,
              onChange: handleInputChange,
              style: {
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical'
              }
            })
          ),
          // Day Care Specific Fields
          formData.admissionType === 'DAY_CARE' && React.createElement(
            'div',
            {
              style: {
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: '#f0f8ff',
                borderRadius: '8px',
                border: '1px solid #007bff'
              }
            },
            React.createElement(
              'h4',
              { style: { margin: '0 0 15px 0', color: '#007bff', fontSize: '16px', fontWeight: 'bold' } },
              '🏥 Day Care Admission Details'
            ),
            React.createElement(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '15px',
                  marginBottom: '15px'
                }
              },
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
                  'Procedure Start Time *'
                ),
                React.createElement('input', {
                  type: 'time',
                  name: 'procedureStartTime',
                  required: formData.admissionType === 'DAY_CARE',
                  value: formData.procedureStartTime,
                  onChange: handleInputChange,
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }
                })
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
                  'Expected Discharge Time *'
                ),
                React.createElement('input', {
                  type: 'time',
                  name: 'expectedDischargeTime',
                  required: formData.admissionType === 'DAY_CARE',
                  value: formData.expectedDischargeTime,
                  onChange: handleInputChange,
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }
                })
              )
            ),
            React.createElement(
              'div',
              { style: { marginBottom: '10px' } },
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
                  name: 'homeSupportAvailable',
                  checked: formData.homeSupportAvailable,
                  onChange: handleInputChange,
                  required: formData.admissionType === 'DAY_CARE',
                  style: {
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer'
                  }
                }),
                React.createElement(
                  'span',
                  { style: { fontWeight: 'bold' } },
                  'Home Support Available *'
                )
              ),
              React.createElement(
                'p',
                { style: { margin: '5px 0 0 26px', fontSize: '12px', color: '#666' } },
                'Patient has adequate home support for recovery (required for day care)'
              )
            ),
            React.createElement(
              'div',
              {
                style: {
                  padding: '10px',
                  backgroundColor: '#fff3cd',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#856404'
                }
              },
              React.createElement('strong', null, 'Day Care Criteria: '),
              'Patient must be medically stable, have adequate home support, and undergo low-risk procedures (6-12 hour duration).'
            )
          ),
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end'
              }
            },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowAddForm(false);
                  setShowEditForm(false);
                  setEditingAdmission(null);
                  setFormData({
                    patientId: '',
                    wardId: '',
                    bedId: '',
                    admissionDate: new Date().toISOString().split('T')[0],
                    admissionType: 'EMERGENCY',
                    admissionReason: '',
                    notes: '',
                    isDayCare: false,
                    procedureStartTime: '',
                    expectedDischargeTime: '',
                    homeSupportAvailable: false
                  });
                },
                style: {
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer'
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
                  backgroundColor: loading ? '#6c757d' : '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }
              },
              loading ? 'Saving...' : (showEditForm ? 'Update Admission' : 'Admit Patient')
            )
          )
        )
      )
    ),

    // Discharge Modal
    showDischargeForm && React.createElement(
      'div',
      {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }
      },
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px',
            position: 'relative'
          }
        },
        // Close button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              setShowDischargeForm(false);
              setDischargingAdmission(null);
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
          'h3',
          { style: { margin: '0 0 20px 0', color: '#333', paddingRight: '32px' } },
          '✅ Discharge Patient'
        ),
        React.createElement(
          'p',
          { style: { marginBottom: '20px', color: '#666' } },
          `Are you sure you want to discharge ${getPatientName(dischargingAdmission?.patientId)}?`
        ),
        React.createElement(
          'form',
          { onSubmit: handleDischarge },
          React.createElement(
            'div',
            { style: { marginBottom: '20px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Discharge Notes'
            ),
            React.createElement('textarea', {
              name: 'dischargeNotes',
              rows: 4,
              value: dischargeData.dischargeNotes,
              onChange: handleDischargeInputChange,
              placeholder: 'Enter discharge notes...',
              style: {
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical'
              }
            })
          ),
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end'
              }
            },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowDischargeForm(false);
                  setDischargingAdmission(null);
                  setDischargeData({ dischargeNotes: '' });
                },
                style: {
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer'
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
                  backgroundColor: loading ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }
              },
              loading ? 'Discharging...' : 'Discharge Patient'
            )
          )
        )
      )
    )
  );
};

export default AdmissionManagement;
