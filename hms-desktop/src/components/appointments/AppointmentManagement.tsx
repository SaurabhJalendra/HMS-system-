import React, { useState, useEffect } from 'react';
import appointmentService from '../../lib/api/services/appointmentService';
import patientService from '../../lib/api/services/patientService';
import LoadingSpinner from '../common/LoadingSpinner';
import { useCriticalUpdateLock } from '../../lib/hooks/useCriticalUpdateLock';

const AppointmentManagement = ({ user, isAuthenticated, onNavigate }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingAppointment, setEditingAppointment] = useState(null);

  useCriticalUpdateLock(Boolean(editingAppointment), 'appointment-edit');

  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [searchFilters, setSearchFilters] = useState({
    date: '',
    doctorId: '',
    status: ''
  });
  const [formData, setFormData] = useState({
    patientId: '',
    doctorId: '',
    date: '',
    time: '09:00',
    status: 'SCHEDULED'
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadAppointments(),
        loadDoctors(),
        loadPatients()
      ]);
    } catch (err) {
      setError('Error loading initial data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    try {
      setError('');
      const response = await appointmentService.getAppointments();
      if (response.appointments) {
        setAppointments(response.appointments || []);
      } else {
        setError('Failed to load appointments');
      }
    } catch (err) {
      console.error('Load appointments error:', err);
      setError('Error loading appointments: ' + (err.response?.data?.message || err.message));
    }
  };

  const loadDoctors = async () => {
    try {
      const doctorsList = await appointmentService.getAvailableDoctors();
      setDoctors(doctorsList || []);
    } catch (err) {
      console.error('Load doctors error:', err);
    }
  };

  const loadPatients = async () => {
    try {
      const response = await patientService.getPatients();
      if (response.patients) {
        setPatients(response.patients || []);
      }
    } catch (err) {
      console.error('Load patients error:', err);
    }
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      const response = await appointmentService.getAppointments(searchFilters);
      if (response.appointments) {
        setAppointments(response.appointments || []);
      } else {
        setError('Search failed');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Search error: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setSearchFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const appointmentData = {
        ...formData,
        date: formData.date + 'T00:00:00.000Z' // Convert to ISO string
      };

      if (editingAppointment) {
        // Update existing appointment
        const response = await appointmentService.updateAppointment(editingAppointment.id, appointmentData);
        if (response) {
          console.log('Appointment updated:', response);
          setSuccess('Appointment updated successfully');
          setEditingAppointment(null);
        }
      } else {
        // Create new appointment
        const response = await appointmentService.createAppointment(appointmentData);
        if (response) {
          console.log('Appointment created:', response);
          setSuccess('Appointment created successfully');
        }
      }

      setEditingAppointment(null);
      setFormData({
        patientId: '',
        doctorId: '',
        date: '',
        time: '09:00',
        status: 'SCHEDULED'
      });
      await loadAppointments(); // Reload the list
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Save appointment error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Unknown error occurred';
      // Provide more user-friendly error messages
      if (errorMessage.includes('not available') || errorMessage.includes('time slot') || errorMessage.includes('conflict')) {
        setError(`⚠️ ${errorMessage}. Please select a different time slot.`);
      } else {
        setError('Error saving appointment: ' + errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (appointment) => {
    try {
      // Set form data with appointment details
      setFormData({
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        date: new Date(appointment.date).toISOString().split('T')[0],
        time: appointment.time,
        status: appointment.status
      });
      // Store appointment ID for update (inline form only for edit; new bookings use OPD Flow)
      setEditingAppointment(appointment);
    } catch (err) {
      console.error('Error preparing edit:', err);
      setError('Error loading appointment details');
    }
  };

  const handleCancel = async (appointment) => {
    if (!window.confirm(`Are you sure you want to cancel the appointment for ${appointment.patient?.name || 'this patient'}?`)) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      await appointmentService.updateAppointment(appointment.id, {
        status: 'CANCELLED'
      });
      setSuccess('Appointment cancelled successfully');
      await loadAppointments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Cancel appointment error:', err);
      setError('Error cancelling appointment: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (appointment) => {
    if (!window.confirm(`Are you sure you want to delete this appointment for ${appointment.patient?.name || 'this patient'}? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      await appointmentService.deleteAppointment(appointment.id);
      setSuccess('Appointment deleted successfully');
      await loadAppointments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Delete appointment error:', err);
      setError('Error deleting appointment: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status) => {
    const colors = {
      SCHEDULED: 'bg-blue-100 text-blue-800',
      CONFIRMED: 'bg-green-100 text-green-800',
      IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
      COMPLETED: 'bg-gray-100 text-gray-800',
      CANCELLED: 'bg-red-100 text-red-800',
      NO_SHOW: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Generate time options
  const timeOptions = [];
  for (let hour = 9; hour < 17; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeOptions.push(timeString);
    }
  }

  if (loading && appointments.length === 0) {
    return React.createElement(
      'div',
      { className: 'flex justify-center items-center h-64' },
      React.createElement(LoadingSpinner, { text: 'Loading appointments...' })
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
          'h1',
          { style: { fontSize: '16px', fontWeight: '600', color: '#000000', margin: 0 } },
          '📅 Appointment Management'
        )
      ),

      // Edit appointment only (book via OPD Flow)
      editingAppointment && React.createElement(
        'div',
        { style: { backgroundColor: '#FFFFFF', padding: '8px 12px', border: '1px solid #C8C8C8', marginBottom: '8px' } },
        React.createElement(
          'h3',
          { style: { fontSize: '14px', fontWeight: '600', color: '#000000', margin: 0, marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #C8C8C8' } },
          'Edit Appointment'
        ),
        React.createElement(
          'form',
          { onSubmit: handleSubmit, style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' } },
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', fontSize: '12px', fontWeight: '500', color: '#000000', marginBottom: '4px' } },
              'Patient *'
            ),
            React.createElement(
              'select',
              {
                name: 'patientId',
                required: true,
                value: formData.patientId,
                onChange: handleInputChange,
                style: { width: '100%', padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
              },
              React.createElement('option', { value: '' }, 'Select Patient'),
              patients.map(patient => React.createElement(
                'option',
                { key: patient.id, value: patient.id },
                `${patient.name}${patient.phone ? ` (${patient.phone})` : ''}`
              ))
            )
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', fontSize: '12px', fontWeight: '500', color: '#000000', marginBottom: '4px' } },
              'Doctor *'
            ),
            React.createElement(
              'select',
              {
                name: 'doctorId',
                required: true,
                value: formData.doctorId,
                onChange: handleInputChange,
                style: { width: '100%', padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
              },
              React.createElement('option', { value: '' }, 'Select Doctor'),
              doctors.map(doctor => React.createElement(
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
              { style: { display: 'block', fontSize: '12px', fontWeight: '500', color: '#000000', marginBottom: '4px' } },
              'Date *'
            ),
            React.createElement('input', {
              type: 'date',
              name: 'date',
              required: true,
              min: new Date().toISOString().split('T')[0],
              value: formData.date,
              onChange: handleInputChange,
              style: { width: '100%', padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
            })
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { style: { display: 'block', fontSize: '12px', fontWeight: '500', color: '#000000', marginBottom: '4px' } },
              'Time *'
            ),
            React.createElement(
              'select',
              {
                name: 'time',
                required: true,
                value: formData.time,
                onChange: handleInputChange,
                style: { width: '100%', padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
              },
              timeOptions.map(time => React.createElement(
                'option',
                { key: time, value: time },
                time
              ))
            )
          ),
          React.createElement(
            'div',
            { style: { gridColumn: 'span 2', marginTop: '8px', display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setEditingAppointment(null);
                  setFormData({
                    patientId: '',
                    doctorId: '',
                    date: '',
                    time: '09:00',
                    status: 'SCHEDULED'
                  });
                },
                style: {
                  backgroundColor: '#F3F3F3',
                  color: '#000000',
                  border: '1px solid #C8C8C8',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: '400',
                  cursor: 'pointer',
                  boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                },
                onMouseOver: (e) => {
                  e.target.style.backgroundColor = '#E8E8E8';
                },
                onMouseOut: (e) => {
                  e.target.style.backgroundColor = '#F3F3F3';
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
                  backgroundColor: loading ? '#C8C8C8' : '#28A745',
                  color: '#FFFFFF',
                  border: '1px solid',
                  borderColor: loading ? '#C8C8C8' : '#1E7E34',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: '400',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
                },
                onMouseOver: (e) => {
                  if (!loading) {
                    e.target.style.backgroundColor = '#1E7E34';
                  }
                },
                onMouseOut: (e) => {
                  if (!loading) {
                    e.target.style.backgroundColor = '#28A745';
                  }
                }
              },
              loading ? 'Updating...' : 'Update Appointment'
            )
          )
        )
      ),

      // Search Filters
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '8px', backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '6px 8px' } },
        React.createElement(
          'input',
          {
            type: 'date',
            name: 'date',
            placeholder: 'Filter by date...',
            value: searchFilters.date,
            onChange: handleFilterChange,
            style: { padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
          }
        ),
        React.createElement(
          'select',
          {
            name: 'doctorId',
            value: searchFilters.doctorId,
            onChange: handleFilterChange,
            style: { padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
          },
          React.createElement('option', { value: '' }, 'All Doctors'),
          doctors.map(doctor => React.createElement(
            'option',
            { key: doctor.id, value: doctor.id },
            doctor.fullName
          ))
        ),
        React.createElement(
          'select',
          {
            name: 'status',
            value: searchFilters.status,
            onChange: handleFilterChange,
            style: { padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
          },
          React.createElement('option', { value: '' }, 'All Statuses'),
          React.createElement('option', { value: 'SCHEDULED' }, 'Scheduled'),
          React.createElement('option', { value: 'CONFIRMED' }, 'Confirmed'),
          React.createElement('option', { value: 'IN_PROGRESS' }, 'In Progress'),
          React.createElement('option', { value: 'COMPLETED' }, 'Completed'),
          React.createElement('option', { value: 'CANCELLED' }, 'Cancelled')
        ),
        React.createElement(
          'button',
          {
            onClick: handleSearch,
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
            onMouseOver: (e: any) => { e.target.style.backgroundColor = '#5A6268'; },
            onMouseOut: (e: any) => { e.target.style.backgroundColor = '#6C757D'; }
          },
          'Search'
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

      // Appointments Table
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
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Doctor'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Date'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Time'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Status'),
              React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Actions')
            )
          ),
          React.createElement(
            'tbody',
            { className: 'bg-white divide-y divide-gray-200' },
            appointments.length === 0 ? React.createElement(
              'tr',
              null,
              React.createElement(
                'td',
                { colSpan: 6, className: 'px-6 py-4 text-center text-gray-500' },
                loading ? 'Loading...' : 'No appointments found. Book visits from OPD Flow.'
              )
            ) : appointments.map((appointment, index) => React.createElement(
              'tr',
              { key: appointment.id || index, className: 'hover:bg-gray-50' },
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' },
                appointment.patient?.name || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                appointment.doctor?.fullName || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                formatDate(appointment.date)
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                appointment.time || 'N/A'
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap' },
                React.createElement(
                  'span',
                  { className: `px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(appointment.status)}` },
                  appointment.status || 'N/A'
                )
              ),
              React.createElement(
                'td',
                { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium' },
                React.createElement(
                  'button',
                  {
                    onClick: () => handleEdit(appointment),
                    className: 'text-blue-600 hover:text-blue-900 mr-3 cursor-pointer'
                  },
                  'Edit'
                ),
                appointment.status !== 'CANCELLED' && appointment.status !== 'COMPLETED' && React.createElement(
                  'button',
                  {
                    onClick: () => handleCancel(appointment),
                    className: 'text-red-600 hover:text-red-900 mr-3 cursor-pointer'
                  },
                  'Cancel'
                ),
                React.createElement(
                  'button',
                  {
                    onClick: () => handleDelete(appointment),
                    className: 'text-red-600 hover:text-red-900 cursor-pointer'
                  },
                  'Delete'
                )
              )
            ))
          )
        )
      )
    )
  );
};

export default AppointmentManagement;