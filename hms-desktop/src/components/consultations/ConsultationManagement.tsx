import React, { useState, useEffect } from 'react';
import { useCriticalUpdateLock } from '../../lib/hooks/useCriticalUpdateLock';
import consultationService from '../../lib/api/services/consultationService';
import appointmentService from '../../lib/api/services/appointmentService';
import patientService from '../../lib/api/services/patientService';
import userService from '../../lib/api/services/userService';
import InfoButton from '../common/InfoButton';
import { getInfoContent } from '../../lib/infoContent';

const ConsultationManagement = ({ onBack, user, appointmentData }) => {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingConsultation, setEditingConsultation] = useState(null);

  useCriticalUpdateLock(
    Boolean(showAddForm || showEditForm),
    'consultation-management'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' or 'consultations'
  
  // Form states
  const [formData, setFormData] = useState({
    appointmentId: '',
    patientId: '',
    doctorId: '',
    diagnosis: '',
    notes: ''
  });

  // Data will be loaded from database
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [appointmentsWithConsultations, setAppointmentsWithConsultations] = useState(new Set()); // Track which appointments have consultations

  // Load data on component mount
  useEffect(() => {
    // Only load data if user is authenticated
    if (user) {
      loadConsultations();
      loadPatients();
      loadDoctors();
      loadAppointments();
    } else {
      setError('Please login to access consultation management');
    }
  }, [user, currentPage, searchTerm, filterDoctor, filterPatient, activeTab]);

  // Handle appointment data passed from appointment management
  useEffect(() => {
    if (appointmentData) {
      setFormData({
        appointmentId: appointmentData.appointmentId || '',
        patientId: appointmentData.patientId || '',
        doctorId: appointmentData.doctorId || '',
        diagnosis: '',
        notes: ''
      });
      setShowAddForm(true); // Automatically open the consultation form
    }
  }, [appointmentData]);

  const loadConsultations = async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: 10,
        ...(searchTerm && { search: searchTerm }),
        ...(filterDoctor && { doctorId: filterDoctor }),
        ...(filterPatient && { patientId: filterPatient })
      };
      
      const response = await consultationService.getConsultations(params);
      setConsultations(response.consultations);
      setTotalPages(response.pagination.totalPages);
      
      // Track which appointments have consultations
      const appointmentsWithCons = new Set(
        response.consultations
          .filter(cons => cons.appointmentId)
          .map(cons => cons.appointmentId)
      );
      setAppointmentsWithConsultations(appointmentsWithCons);
      
      setError('');
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else {
        setError('❌ Failed to load consultations');
      }
      console.error('Error loading consultations:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      const response = await patientService.getPatients({ page: 1, limit: 1000 });
      setPatients(response.patients);
    } catch (err) {
      console.error('Error loading patients:', err);
    }
  };

  const loadDoctors = async () => {
    try {
      const response = await userService.getUsers({ role: 'DOCTOR', page: 1, limit: 100 });
      setDoctors(response.users || []);
    } catch (err) {
      console.error('Error loading doctors:', err);
    }
  };

  const loadAppointments = async () => {
    try {
      // Load all appointments that are available for consultation
      // Filter to show SCHEDULED, CONFIRMED, and IN_PROGRESS appointments
      const response = await appointmentService.getAppointments({ 
        page: 1, 
        limit: 1000,
      });
      
      // Filter appointments to show only those available for consultation
      // (SCHEDULED, CONFIRMED, IN_PROGRESS) and exclude CANCELLED and COMPLETED
      const availableAppointments = (response.appointments || []).filter(apt => 
        apt.status === 'SCHEDULED' || 
        apt.status === 'CONFIRMED' || 
        apt.status === 'IN_PROGRESS'
      );
      
      // Sort by date (most recent first)
      availableAppointments.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA;
      });
      
      setAppointments(availableAppointments);
      console.log(`✅ Loaded ${availableAppointments.length} available appointments for consultation`);
    } catch (err) {
      console.error('Error loading appointments:', err);
      setError('Failed to load appointments. Please try again.');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newFormData = {
        ...prev,
        [name]: value
      };
      
      // If appointment is selected, auto-fill patient and doctor from appointment
      if (name === 'appointmentId' && value) {
        const selectedAppointment = appointments.find(apt => apt.id === value);
        if (selectedAppointment) {
          newFormData.patientId = selectedAppointment.patientId || prev.patientId;
          newFormData.doctorId = selectedAppointment.doctorId || prev.doctorId;
          console.log('✅ Auto-filled patient and doctor from selected appointment');
        }
      }
      
      return newFormData;
    });
  };

  const handleConsult = (appointment) => {
    // Pre-fill form with appointment data and open consultation form
    const patient = appointment.patient || patients.find(p => p.id === appointment.patientId);
    const doctor = appointment.doctor || doctors.find(d => d.id === appointment.doctorId);
    
    setFormData({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      diagnosis: '',
      notes: ''
    });
    setShowAddForm(true);
    setError('');
    setSuccess('');
  };

  const handleDeleteAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel/delete this appointment? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      await appointmentService.updateAppointment(appointmentId, {
        status: 'CANCELLED'
      });
      setSuccess('✅ Appointment cancelled successfully!');
      await loadAppointments();
      await loadConsultations(); // Reload to update tracking
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('❌ Failed to cancel appointment: ' + (err.response?.data?.message || err.message));
      console.error('Error cancelling appointment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const consultationData = {
        appointmentId: formData.appointmentId,
        patientId: formData.patientId,
        doctorId: formData.doctorId,
        diagnosis: formData.diagnosis,
        notes: formData.notes
      };
      
      if (showEditForm && editingConsultation) {
        // Update existing consultation
        await consultationService.updateConsultation(editingConsultation.id, consultationData);
        setShowEditForm(false);
        setEditingConsultation(null);
        setSuccess('✅ Consultation updated successfully!');
        setError('');
      } else {
        // Create new consultation
        await consultationService.createConsultation(consultationData);
        setShowAddForm(false);
        setSuccess('✅ Consultation created successfully!');
        setError('');
      }
      
      // Reload consultations and appointments from database
      await Promise.all([loadConsultations(), loadAppointments()]);
      
      setFormData({
        appointmentId: '',
        patientId: '',
        doctorId: '',
        diagnosis: '',
        notes: ''
      });
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else {
        setError('❌ Failed to save consultation. Please try again.');
      }
      console.error('Error saving consultation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (consultation) => {
    setEditingConsultation(consultation);
    setFormData({
      appointmentId: consultation.appointmentId,
      patientId: consultation.patientId,
      doctorId: consultation.doctorId,
      diagnosis: consultation.diagnosis,
      notes: consultation.notes || ''
    });
    setShowEditForm(true);
  };

  const handleDelete = async (consultationId) => {
    if (!window.confirm('Are you sure you want to delete this consultation?')) {
      return;
    }

    setLoading(true);
    try {
      await consultationService.deleteConsultation(consultationId);
      await loadConsultations(); // Reload from database
      setError('✅ Consultation deleted successfully!');
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else {
        setError('❌ Failed to delete consultation. Please try again.');
      }
      console.error('Error deleting consultation:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const dateObj = new Date(dateString);
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateWithTime = (dateString) => {
    if (!dateString) return 'N/A';
    const dateObj = new Date(dateString);
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      SCHEDULED: { bg: '#DBEAFE', text: '#1E40AF' },
      CONFIRMED: { bg: '#D1FAE5', text: '#065F46' },
      IN_PROGRESS: { bg: '#FEF3C7', text: '#92400E' },
      COMPLETED: { bg: '#E5E7EB', text: '#374151' },
      CANCELLED: { bg: '#FEE2E2', text: '#991B1B' }
    };
    return colors[status] || { bg: '#E5E7EB', text: '#374151' };
  };

  const renderConsultationForm = () => {
    return React.createElement(
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
        }
      },
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FFFFFF',
            padding: '8px 12px',
            borderRadius: '2px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            border: '1px solid #C8C8C8'
          }
        },
        // Header
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '1px solid #E5E7EB',
              paddingBottom: '16px'
            }
          },
          React.createElement(
            'h3',
            { style: { margin: 0, color: '#111827', fontSize: '18px', fontWeight: '600' } },
            showEditForm ? 'Edit Consultation' : 'Consultation'
          ),
          React.createElement(
            'button',
            {
              onClick: () => {
                setShowAddForm(false);
                setShowEditForm(false);
                setEditingConsultation(null);
                setFormData({
                  appointmentId: '',
                  patientId: '',
                  doctorId: '',
                  diagnosis: '',
                  notes: ''
                });
              },
              style: {
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#6B7280',
                padding: '4px'
              }
            },
            '×'
          )
        ),

        // Form
        React.createElement(
          'form',
          { onSubmit: handleSubmit },
          React.createElement(
            'div',
            { style: { marginBottom: '16px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#111827', fontSize: '14px' } },
              'Appointment (Optional)'
            ),
            React.createElement(
              'select',
              {
                name: 'appointmentId',
                value: formData.appointmentId,
                onChange: handleInputChange,
                required: false,
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: '#FFFFFF'
                }
              },
              React.createElement('option', { value: '' }, appointments.length === 0 ? 'No Available Appointments' : 'Select Appointment (Optional)'),
              appointments.length === 0 ? React.createElement(
                'option',
                { value: '', disabled: true },
                'No appointments available. You can still create a consultation without linking to an appointment.'
              ) : appointments.map(appointment => {
                // Use patient from appointment if available, otherwise find from patients list
                const patient = appointment.patient || patients.find(p => p.id === appointment.patientId);
                const patientName = patient ? patient.name : 'Unknown Patient';
                
                // Format date properly (without time, since we'll show time separately)
                let appointmentDate = 'No Date';
                if (appointment.date) {
                  const dateObj = new Date(appointment.date);
                  appointmentDate = dateObj.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  });
                }
                
                const appointmentTime = appointment.time || 'No Time';
                
                // Also include doctor name if available
                const doctor = appointment.doctor;
                const doctorName = doctor ? doctor.fullName : '';
                
                // Get appointment status for display
                const status = appointment.status || 'UNKNOWN';
                
                // Build display string: "Date Time - Doctor Name - Patient Name [Status]" or just "Date Time - Patient Name [Status]"
                const displayText = doctorName 
                  ? `${appointmentDate} ${appointmentTime} - Dr. ${doctorName} - ${patientName} [${status}]`
                  : `${appointmentDate} ${appointmentTime} - ${patientName} [${status}]`;
                
                return React.createElement(
                  'option',
                  { key: appointment.id, value: appointment.id },
                  displayText
                );
              })
            )
          ),

          React.createElement(
            'div',
            { style: { marginBottom: '8px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#000000', fontSize: '12px' } },
              'Patient *'
            ),
            React.createElement(
              'select',
              {
                name: 'patientId',
                value: formData.patientId,
                onChange: handleInputChange,
                required: true,
                style: {
                  width: '100%',
                  padding: '10px',
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
            { style: { marginBottom: '8px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#000000', fontSize: '12px' } },
              'Doctor *'
            ),
            React.createElement(
              'select',
              {
                name: 'doctorId',
                value: formData.doctorId,
                onChange: handleInputChange,
                required: true,
                style: {
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
              React.createElement('option', { value: '' }, 'Select Doctor'),
              ...doctors.map(doctor => React.createElement(
                'option',
                { key: doctor.id, value: doctor.id },
                doctor.fullName
              ))
            )
          ),

          React.createElement(
            'div',
            { style: { marginBottom: '8px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#000000', fontSize: '12px' } },
              'Diagnosis *'
            ),
            React.createElement('textarea', {
              name: 'diagnosis',
              value: formData.diagnosis,
              onChange: handleInputChange,
              required: true,
              rows: 3,
              placeholder: 'Enter diagnosis...',
              style: {
                width: '100%',
                padding: '4px 8px',
                border: '1px solid #C8C8C8',
                borderRadius: '2px',
                fontSize: '13px',
                backgroundColor: '#FFFFFF',
                boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                resize: 'vertical'
              }
            })
          ),

          React.createElement(
            'div',
            { style: { marginBottom: '8px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#000000', fontSize: '12px' } },
              'Notes'
            ),
            React.createElement('textarea', {
              name: 'notes',
              value: formData.notes,
              onChange: handleInputChange,
              rows: 4,
              placeholder: 'Enter consultation notes...',
              style: {
                width: '100%',
                padding: '4px 8px',
                border: '1px solid #C8C8C8',
                borderRadius: '2px',
                fontSize: '13px',
                backgroundColor: '#FFFFFF',
                boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                resize: 'vertical'
              }
            })
          ),

          // Buttons
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end',
                marginTop: '20px'
              }
            },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowAddForm(false);
                  setShowEditForm(false);
                  setEditingConsultation(null);
                  setFormData({
                    appointmentId: '',
                    patientId: '',
                    doctorId: '',
                    diagnosis: '',
                    notes: ''
                  });
                },
                style: {
                  padding: '4px 12px',
                  border: '1px solid #C8C8C8',
                  borderRadius: '2px',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#000000'
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
                  padding: '4px 12px',
                  border: '1px solid',
                  borderColor: loading ? '#C8C8C8' : '#005A9E',
                  borderRadius: '2px',
                  backgroundColor: loading ? '#C8C8C8' : '#0078D4',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: '400',
                  boxShadow: loading ? 'none' : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }
              },
              loading ? 'Saving...' : (showEditForm ? 'Update Consultation' : 'Create Consultation')
            )
          )
        )
      )
    );
  };

  return React.createElement(
    'div',
    { style: { minHeight: '100vh', backgroundColor: '#F0F0F0', padding: '8px' } },
    
    // Header with Tabs
    React.createElement(
      'div',
      {
        style: {
          backgroundColor: '#FFFFFF',
          border: '1px solid #C8C8C8',
          padding: '8px 12px',
          marginBottom: '8px'
        }
      },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #C8C8C8' } },
        React.createElement(
          'h1',
          { style: { margin: 0, color: '#000000', fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' } },
          'Consultation Management',
          React.createElement(InfoButton, {
            title: getInfoContent('consultations').title,
            content: getInfoContent('consultations').content,
            size: 'sm',
            variant: 'info'
          })
        )
      ),
      // Tabs
      React.createElement(
        'div',
        { style: { display: 'flex', gap: '8px', borderBottom: '2px solid #E5E7EB' } },
        React.createElement(
          'button',
          {
            onClick: () => setActiveTab('appointments'),
            style: {
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'appointments' ? '2px solid #2563EB' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'appointments' ? '#2563EB' : '#6B7280',
              cursor: 'pointer',
              fontWeight: activeTab === 'appointments' ? '600' : '400',
              fontSize: '14px'
            }
          },
          `📅 Booked Appointments (${appointments.length})`
        ),
        React.createElement(
          'button',
          {
            onClick: () => setActiveTab('consultations'),
            style: {
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'consultations' ? '2px solid #2563EB' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'consultations' ? '#2563EB' : '#6B7280',
              cursor: 'pointer',
              fontWeight: activeTab === 'consultations' ? '600' : '400',
              fontSize: '14px'
            }
          },
          `🩺 Consultations (${consultations.length})`
        )
      )
    ),
    
    // Success/Error Messages
    success && React.createElement(
      'div',
      { style: { backgroundColor: '#D1FAE5', border: '1px solid #10B981', color: '#065F46', padding: '12px 16px', borderRadius: '4px', marginBottom: '16px' } },
      success
    ),
    error && React.createElement(
      'div',
      { style: { backgroundColor: '#FEE2E2', border: '1px solid #EF4444', color: '#991B1B', padding: '12px 16px', borderRadius: '4px', marginBottom: '16px' } },
      error
    ),

    // Content
    React.createElement(
      'div',
      { style: { padding: '0' } },
      
      // Filters
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            padding: '16px',
            marginBottom: '16px',
            marginLeft: '24px',
            marginRight: '24px'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              alignItems: 'end'
            }
          },
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#111827', fontSize: '14px' } },
              'Search'
            ),
            React.createElement('input', {
              type: 'text',
              value: searchTerm,
              onChange: (e) => setSearchTerm(e.target.value),
              placeholder: 'Search consultations...',
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                fontSize: '14px',
                backgroundColor: '#FFFFFF'
              }
            })
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#111827', fontSize: '14px' } },
              'Filter by Doctor'
            ),
            React.createElement(
              'select',
              {
                value: filterDoctor,
                onChange: (e) => setFilterDoctor(e.target.value),
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: '#FFFFFF'
                }
              },
              React.createElement('option', { value: '' }, 'All Doctors'),
              ...doctors.map(doctor => React.createElement(
                'option',
                { key: doctor.id, value: doctor.id },
                doctor.fullName
              ))
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#111827', fontSize: '14px' } },
              'Filter by Patient'
            ),
            React.createElement(
              'select',
              {
                value: filterPatient,
                onChange: (e) => setFilterPatient(e.target.value),
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: '#FFFFFF'
                }
              },
              React.createElement('option', { value: '' }, 'All Patients'),
              ...patients.map(patient => React.createElement(
                'option',
                { key: patient.id, value: patient.id },
                patient.name
              ))
            )
          )
        )
      ),

      // Appointments Table (when appointments tab is active)
      activeTab === 'appointments' && React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
            marginLeft: '24px',
            marginRight: '24px'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              padding: '16px',
              borderBottom: '1px solid #E5E7EB',
              backgroundColor: '#F9FAFB'
            }
          },
          React.createElement(
            'h3',
            { style: { margin: 0, color: '#111827', fontSize: '16px', fontWeight: '600' } },
            `Booked Appointments (${appointments.length})`
          )
        ),
        loading ? React.createElement(
          'div',
          {
            style: {
              padding: '40px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px'
            }
          },
          'Loading appointments...'
        ) : appointments.length === 0 ? React.createElement(
          'div',
          {
            style: {
              padding: '40px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px'
            }
          },
          'No appointments available for consultation. Book visits from OPD Flow.'
        ) : React.createElement(
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
              null,
              React.createElement(
                'tr',
                { style: { backgroundColor: '#F9FAFB' } },
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Date & Time'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Patient'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Doctor'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Status'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Consultation'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'center', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              null,
              ...appointments.map(appointment => {
                const patient = appointment.patient || patients.find(p => p.id === appointment.patientId);
                const doctor = appointment.doctor || doctors.find(d => d.id === appointment.doctorId);
                const hasConsultation = appointmentsWithConsultations.has(appointment.id);
                const statusColor = getStatusColor(appointment.status);
                
                return React.createElement(
                  'tr',
                  {
                    key: appointment.id,
                    style: {
                      borderBottom: '1px solid #F3F4F6'
                    }
                  },
                  React.createElement(
                    'td',
                    { style: { padding: '12px', fontSize: '14px', color: '#111827' } },
                    React.createElement('div', { style: { fontWeight: '500' } }, formatDate(appointment.date)),
                    React.createElement('div', { style: { fontSize: '12px', color: '#6B7280' } }, appointment.time || 'N/A')
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px' } },
                    React.createElement(
                      'div',
                      null,
                      React.createElement(
                        'div',
                        { style: { fontWeight: '500', color: '#111827', fontSize: '14px' } },
                        patient ? patient.name : 'Unknown Patient'
                      ),
                      patient && React.createElement(
                        'div',
                        { style: { fontSize: '12px', color: '#6B7280' } },
                        `${patient.age} years, ${patient.gender}`
                      )
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px', fontSize: '14px', color: '#111827' } },
                    doctor ? doctor.fullName : 'Unknown Doctor'
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px' } },
                    React.createElement(
                      'span',
                      {
                        style: {
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: statusColor.bg,
                          color: statusColor.text
                        }
                      },
                      appointment.status || 'N/A'
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '12px', fontSize: '14px' } },
                    hasConsultation ? React.createElement(
                      'span',
                      { style: { color: '#10B981', fontWeight: '500' } },
                      '✅ Consultation Done'
                    ) : React.createElement(
                      'span',
                      { style: { color: '#F59E0B', fontWeight: '500' } },
                      '⏳ Pending Consultation'
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
                          gap: '8px',
                          justifyContent: 'center'
                        }
                      },
                      !hasConsultation && React.createElement(
                        'button',
                        {
                          onClick: () => handleConsult(appointment),
                          style: {
                            backgroundColor: '#10B981',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500'
                          }
                        },
                        'Consult'
                      ),
                      React.createElement(
                        'button',
                        {
                          onClick: () => handleDeleteAppointment(appointment.id),
                          style: {
                            backgroundColor: '#EF4444',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500'
                          }
                        },
                        'Delete'
                      )
                    )
                  )
                );
              })
            )
          )
        )
      ),

      // Consultations table (when consultations tab is active)
      activeTab === 'consultations' && React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
            marginLeft: '24px',
            marginRight: '24px'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              padding: '16px',
              borderBottom: '1px solid #E5E7EB',
              backgroundColor: '#F9FAFB'
            }
          },
          React.createElement(
            'h3',
            { style: { margin: 0, color: '#111827', fontSize: '16px', fontWeight: '600' } },
            `Consultations (${consultations.length})`
          )
        ),
        
        loading ? React.createElement(
          'div',
          {
            style: {
              padding: '40px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px'
            }
          },
          'Loading consultations...'
        ) : consultations.length === 0 ? React.createElement(
          'div',
          {
            style: {
              padding: '40px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px'
            }
          },
          'No consultations found'
        ) : React.createElement(
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
              null,
              React.createElement(
                'tr',
                { style: { backgroundColor: '#F9FAFB' } },
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Date'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Patient'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Doctor'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Diagnosis'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Notes'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'center', borderBottom: '1px solid #E5E7EB', fontWeight: '600', fontSize: '14px', color: '#111827' } }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              null,
              ...consultations.map(consultation => React.createElement(
                'tr',
                {
                  key: consultation.id,
                  style: {
                    borderBottom: '1px solid #F3F4F6'
                  }
                },
              React.createElement(
                'td',
                { style: { padding: '12px', fontSize: '14px', color: '#111827' } },
                formatDate(consultation.consultationDate)
              ),
              React.createElement(
                'td',
                { style: { padding: '12px' } },
                React.createElement(
                  'div',
                  null,
                  React.createElement(
                    'div',
                    { style: { fontWeight: '500', color: '#111827', fontSize: '14px' } },
                    (() => {
                      return consultation.patient ? consultation.patient.name : 'Unknown Patient';
                    })()
                  ),
                  React.createElement(
                    'div',
                    { style: { fontSize: '12px', color: '#6B7280' } },
                    (() => {
                      return consultation.patient ? `${consultation.patient.age} years, ${consultation.patient.gender}` : 'Unknown';
                    })()
                  )
                )
              ),
              React.createElement(
                'td',
                { style: { padding: '12px', fontSize: '14px', color: '#111827' } },
                (() => {
                  return consultation.doctor ? consultation.doctor.fullName : 'Unknown Doctor';
                })()
              ),
              React.createElement(
                'td',
                { style: { padding: '12px', maxWidth: '200px', fontSize: '14px', color: '#111827' } },
                React.createElement(
                  'div',
                  {
                    style: {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    },
                    title: consultation.diagnosis
                  },
                  consultation.diagnosis
                )
              ),
              React.createElement(
                'td',
                { style: { padding: '12px', maxWidth: '200px', fontSize: '14px', color: '#111827' } },
                consultation.notes ? React.createElement(
                  'div',
                  {
                    style: {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    },
                    title: consultation.notes
                  },
                  consultation.notes
                ) : '-'
              ),
              React.createElement(
                'td',
                { style: { padding: '12px', textAlign: 'center' } },
                React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'center'
                    }
                  },
                  React.createElement(
                    'button',
                    {
                      onClick: () => handleEdit(consultation),
                      style: {
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500'
                      }
                    },
                    'Edit'
                  ),
                  React.createElement(
                    'button',
                    {
                      onClick: () => handleDelete(consultation.id),
                      style: {
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500'
                      }
                    },
                    'Delete'
                  )
                )
              )
            ))
          )
        )
      )
    )
    ),

    // Consultation form modal
    (showAddForm || showEditForm) && renderConsultationForm()
  );
};

export default ConsultationManagement;