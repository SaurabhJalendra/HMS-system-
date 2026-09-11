import React, { useState, useEffect } from 'react';
import wardService from '../../lib/api/services/wardService';
import { useHospitalConfig } from '../../lib/contexts/HospitalConfigContext';
import { formatCurrencySync, getCurrencySymbol } from '../../lib/utils/currencyAndTimezone';
import { autoSelectIfZero, autoSelectIfZeroMouseDown } from '../../lib/utils/numberInput';

const WardManagement = ({ onBack: _onBack, isAuthenticated }) => {
  const { displayCurrency } = useHospitalConfig();
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingWard, setEditingWard] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    type: 'GENERAL',
    capacity: '',
    description: '',
    floor: '',
    dailyRate: ''
  });

  const wardTypes = [
    { value: 'GENERAL', label: 'General Ward', icon: '🏥' },
    { value: 'ICU', label: 'Intensive Care Unit', icon: '🚨' },
    { value: 'PRIVATE', label: 'Private Ward', icon: '🏠' },
    { value: 'EMERGENCY', label: 'Emergency Ward', icon: '🚑' },
    { value: 'PEDIATRIC', label: 'Pediatric Ward', icon: '🧒' },
    { value: 'MATERNITY', label: 'Maternity Ward', icon: '🤱' },
    { value: 'SURGICAL', label: 'Surgical Ward', icon: '⚕️' },
    { value: 'CARDIAC', label: 'Cardiac Ward', icon: '❤️' },
    { value: 'NEUROLOGY', label: 'Neurology Ward', icon: '🧠' },
    { value: 'ORTHOPEDIC', label: 'Orthopedic Ward', icon: '🦴' },
    { value: 'DAY_CARE', label: 'Day Care Ward (Same-Day Surgery)', icon: '🏥' }
  ];

  useEffect(() => {
    if (isAuthenticated) {
      loadWards();
    } else {
      setError('Please login to access ward management');
    }
  }, [isAuthenticated, searchTerm, filterType, filterStatus]);

  const loadWards = async () => {
    setLoading(true);
    try {
      const params = {
        page: 1,
        limit: 100,
        ...(searchTerm && { search: searchTerm }),
        ...(filterType && { type: filterType }),
        ...(filterStatus && { isActive: filterStatus === 'active' })
      };
      
      console.log('🏥 Loading wards with params:', params);
      const response = await wardService.getWards(params);
      console.log('🏥 Ward service response:', response);
      
      // Handle different response structures
      let wardsList = [];
      if (response && response.wards) {
        wardsList = Array.isArray(response.wards) ? response.wards : [];
      } else if (response && response.data && response.data.wards) {
        wardsList = Array.isArray(response.data.wards) ? response.data.wards : [];
      } else if (Array.isArray(response)) {
        wardsList = response;
      }
      
      console.log(`✅ Loaded ${wardsList.length} wards from backend`);
      console.log(`📋 Wards loaded:`, wardsList.map(w => ({ id: w.id, name: w.name })));
      
      // Force state update by creating a new array reference
      setWards([...wardsList]);
      setError('');
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to load wards';
        setError(`❌ ${errorMsg}`);
      }
      console.error('❌ Error loading wards:', err);
      console.error('❌ Error response:', err.response?.data);
      setWards([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    e.stopPropagation(); // Prevent event bubbling that might interfere
    const { name, value } = e.target;
    console.log(`📝 Input changed: ${name} = "${value}"`); // Debug log
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate required fields
    if (!formData.name || formData.name.trim() === '') {
      setError('❌ Please enter a ward name');
      setLoading(false);
      return;
    }
    if (!formData.capacity || parseInt(formData.capacity) <= 0) {
      setError('❌ Please enter a valid capacity (greater than 0)');
      setLoading(false);
      return;
    }

    try {
      console.log('📝 Submitting ward data:', {
        name: formData.name,
        type: formData.type,
        capacity: formData.capacity
      });

      const wardData = {
        name: formData.name.trim(),
        type: formData.type,
        capacity: parseInt(formData.capacity),
        description: formData.description?.trim() || undefined,
        floor: formData.floor?.trim() || undefined,
        dailyRate: formData.dailyRate && formData.dailyRate !== '' 
          ? parseFloat(formData.dailyRate) 
          : undefined
      };

      if (showEditForm && editingWard) {
        await wardService.updateWard(editingWard.id, wardData);
        setShowEditForm(false);
        setEditingWard(null);
        setError('✅ Ward updated successfully!');
      } else {
        await wardService.createWard(wardData);
        setShowAddForm(false);
        setError('✅ Ward created successfully!');
      }

      await loadWards();

      // Reset form
      setFormData({
        name: '',
        type: 'GENERAL',
        capacity: '',
        description: '',
        floor: '',
        dailyRate: ''
      });

    } catch (err) {
      console.error('❌ Error saving ward:', err);
      console.error('❌ Error response:', err.response?.data);
      console.error('❌ Error details:', {
        status: err.response?.status,
        message: err.response?.data?.message,
        errors: err.response?.data?.errors
      });
      
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else if (err.response?.data?.message) {
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
        
        setError(`❌ ${errorMsg}`);
      } else if (err.message) {
        setError(`❌ ${err.message}`);
      } else {
        setError('❌ Failed to save ward. Please check the console for details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (ward) => {
    setEditingWard(ward);
    setFormData({
      name: ward.name || '',
      type: ward.type || 'GENERAL',
      capacity: ward.capacity?.toString() || '',
      description: ward.description || '',
      floor: ward.floor || '',
      dailyRate: ward.dailyRate ? ward.dailyRate.toString() : ''
    });
    setShowEditForm(true);
    setShowAddForm(false);
  };

  const handleDelete = async (wardId, force = false) => {
    const ward = wards.find(w => w.id === wardId);
    const wardName = ward?.name || 'this ward';
    
    let confirmMessage = `Are you sure you want to delete "${wardName}"? This action cannot be undone.`;
    if (force) {
      confirmMessage += '\n\n⚠️ Force delete will remove all beds and related records.';
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log(`🗑️ Deleting ward ${wardId}${force ? ' (force)' : ''}`);
      console.log(`📋 Current wards before deletion:`, wards.map(w => ({ id: w.id, name: w.name })));
      
      const params = force ? { force: 'true' } : {};
      const response = await wardService.deleteWard(wardId, params);
      
      console.log('✅ Ward deletion response:', response);
      
      // Immediately remove the ward from state for instant UI update
      setWards(prevWards => {
        const updatedWards = prevWards.filter(w => w.id !== wardId);
        console.log(`🗑️ Removed ward from state. Previous count: ${prevWards.length}, New count: ${updatedWards.length}`);
        return updatedWards;
      });
      
      // Set success message
      setError('✅ Ward deleted successfully!');
      
      // Reload from backend to ensure consistency
      await loadWards();
      
      // Double-check after a short delay to ensure deletion is reflected
      setTimeout(async () => {
        try {
          const refreshedWards = await wardService.getWards({ page: 1, limit: 100 });
          const wardsList = refreshedWards?.wards || [];
          console.log(`🔄 Final ward count after refresh: ${wardsList.length}`);
          console.log(`📋 Wards after refresh:`, wardsList.map(w => ({ id: w.id, name: w.name })));
          
          // Verify the deleted ward is not in the list BEFORE updating state
          const stillExists = wardsList.some(w => w.id === wardId);
          
          if (stillExists) {
            console.error(`❌ ERROR: Ward ${wardId} still exists in backend response!`);
            // Don't update state if ward still exists - keep the manually removed state
            setError(`❌ Error: Ward deletion failed. The ward still exists in the database.`);
          } else {
            console.log(`✅ Verified: Ward ${wardId} successfully removed from backend`);
            // Update state with fresh data (force new array reference)
            setWards([...wardsList]);
            
            // Clear success message after showing it
            setTimeout(() => {
              setError(prevError => {
                // Only clear if it's still the success message
                if (prevError.includes('✅ Ward deleted successfully')) {
                  return '';
                }
                return prevError;
              });
            }, 3000);
          }
        } catch (refreshError) {
          console.error('❌ Error refreshing wards:', refreshError);
          setError(`❌ Error refreshing ward list. Please refresh the page.`);
        }
      }, 1000);
      
    } catch (err) {
      console.error('❌ Error deleting ward:', err);
      console.error('❌ Error response:', err.response?.data);
      
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else if (err.response?.data?.canForceDelete) {
        // Show detailed error with force delete option
        const errorData = err.response.data.data || {};
        const issues = [];
        if (errorData.activeAdmissions > 0) {
          issues.push(`${errorData.activeAdmissions} active admission(s)`);
        }
        if (errorData.occupiedBeds > 0) {
          issues.push(`${errorData.occupiedBeds} occupied bed(s)`);
        }
        
        const detailedMessage = `Cannot delete ward: ${issues.join(' and ')} exist.`;
        const confirmForce = window.confirm(
          `${detailedMessage}\n\nDo you want to force delete? This will remove all beds and related records.`
        );
        
        if (confirmForce) {
          // Retry with force delete
          await handleDelete(wardId, true);
        } else {
          setError(`❌ ${err.response.data.message}`);
        }
      } else if (err.response?.data?.message) {
        setError(`❌ ${err.response.data.message}`);
      } else {
        setError('❌ Failed to delete ward. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (wardId) => {
    setLoading(true);
    try {
      const ward = wards.find(w => w.id === wardId);
      if (ward) {
        await wardService.updateWard(wardId, { isActive: !ward.isActive });
        await loadWards();
        setError('✅ Ward status updated successfully!');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Authentication required. Please login first.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } else {
        setError('❌ Failed to update ward status. Please try again.');
      }
      console.error('Error updating ward status:', err);
    } finally {
      setLoading(false);
    }
  };

  const getWardTypeInfo = (type) => {
    return wardTypes.find(t => t.value === type) || { value: type, label: type, icon: '🏥' };
  };

  const filteredWards = wards.filter(ward => {
    const matchesSearch = ward.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (ward.description && ward.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = !filterType || ward.type === filterType;
    const matchesStatus = filterStatus === '' || 
                         (filterStatus === 'active' && ward.isActive) ||
                         (filterStatus === 'inactive' && !ward.isActive);
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const stats = {
    totalWards: wards.length,
    activeWards: wards.filter(w => w.isActive).length,
    inactiveWards: wards.filter(w => !w.isActive).length,
    totalCapacity: wards.reduce((sum, ward) => sum + (ward.capacity || 0), 0),
    totalOccupancy: wards.reduce((sum, ward) => sum + (ward.currentOccupancy || 0), 0),
    availableBeds: wards.reduce((sum, ward) => sum + ((ward.capacity || 0) - (ward.currentOccupancy || 0)), 0)
  };

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F0F0F0', padding: '8px' } },
    
    // Header
    React.createElement(
      'div',
      {
        style: {
          backgroundColor: '#FFFFFF',
          border: '1px solid #C8C8C8',
          padding: '8px 12px'
        }
      },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #C8C8C8' } },
        React.createElement(
          'h1',
          { style: { fontSize: '16px', fontWeight: '600', color: '#000000', margin: 0 } },
          '🏥 Ward Management'
        ),
        React.createElement(
          'button',
          {
            onClick: () => {
              setShowAddForm(true);
              setShowEditForm(false);
              setEditingWard(null);
              setFormData({
                name: '',
                type: 'GENERAL',
                capacity: '',
                description: '',
                floor: '',
                dailyRate: ''
              });
            },
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
          '+ Add New Ward'
        )
      )
    ),

    // Content
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },

      // Statistics Cards
      React.createElement(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '8px'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
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
            stats.totalWards
          ),
          React.createElement(
            'div',
            { style: { color: '#6B7280', fontSize: '13px' } },
            'Total Wards'
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
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
            stats.activeWards
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Active Wards'
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
              textAlign: 'center'
            }
          },
          React.createElement(
            'div',
            { style: { fontSize: '24px', marginBottom: '8px' } },
            '🛏️'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', fontWeight: 'bold', color: '#17a2b8' } },
            stats.totalCapacity
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Total Capacity'
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
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
            stats.totalOccupancy
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Current Occupancy'
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
              textAlign: 'center'
            }
          },
          React.createElement(
            'div',
            { style: { fontSize: '24px', marginBottom: '8px' } },
            '🆓'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', fontWeight: 'bold', color: '#28a745' } },
            stats.availableBeds
          ),
          React.createElement(
            'div',
            { style: { color: '#666', fontSize: '14px' } },
            'Available Beds'
          )
        )
      ),

      // Search and Filters
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FFFFFF',
            border: '1px solid #C8C8C8',
            padding: '6px 8px'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              alignItems: 'center'
            }
          },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Search by name or description...',
            value: searchTerm,
            onChange: (e) => setSearchTerm(e.target.value),
            style: {
              padding: '4px 8px',
              border: '1px solid #C8C8C8',
              borderRadius: '2px',
              fontSize: '13px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }
          }),
          React.createElement(
            'select',
            {
              value: filterType,
              onChange: (e) => setFilterType(e.target.value),
              style: {
                padding: '4px 8px',
                border: '1px solid #C8C8C8',
                borderRadius: '2px',
                fontSize: '13px',
                backgroundColor: '#FFFFFF',
                boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }
            },
            React.createElement('option', { value: '' }, 'All Types'),
            ...wardTypes.map(type => React.createElement(
              'option',
              { key: type.value, value: type.value },
              `${type.icon} ${type.label}`
            ))
          ),
          React.createElement(
            'select',
            {
              value: filterStatus,
              onChange: (e) => setFilterStatus(e.target.value),
              style: {
                padding: '4px 8px',
                border: '1px solid #C8C8C8',
                borderRadius: '2px',
                fontSize: '13px',
                backgroundColor: '#FFFFFF',
                boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }
            },
            React.createElement('option', { value: '' }, 'All Status'),
            React.createElement('option', { value: 'active' }, 'Active'),
            React.createElement('option', { value: 'inactive' }, 'Inactive')
          )
        )
      ),

      // Error/Success Message
      error && React.createElement(
        'div',
        {
          style: {
            backgroundColor: error.includes('✅') ? '#D1FAE5' : '#FEF2F2',
            border: `1px solid ${error.includes('✅') ? '#A7F3D0' : '#FECACA'}`,
            color: error.includes('✅') ? '#065F46' : '#DC2626',
            padding: '12px',
            marginBottom: '8px',
            fontSize: '14px',
            borderRadius: '4px'
          }
        },
        error
      ),

      // Wards Table
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FFFFFF',
            border: '1px solid #C8C8C8',
            borderRadius: '0'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              padding: '8px 12px',
              borderBottom: '1px solid #C8C8C8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#F3F3F3'
            }
          },
          React.createElement(
            'h3',
            { style: { margin: 0, fontSize: '14px', fontWeight: '600', color: '#000000' } },
            `Wards (${filteredWards.length})`
          ),
          loading && React.createElement(
            'div',
            { style: { color: '#0078D4', fontSize: '13px' } },
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
                  backgroundColor: '#F3F3F3',
                  borderBottom: '1px solid #C8C8C8'
                }
              },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px', color: '#000000', borderRight: '1px solid #C8C8C8' } }, 'Ward'),
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px', color: '#000000', borderRight: '1px solid #C8C8C8' } }, 'Type'),
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px', color: '#000000', borderRight: '1px solid #C8C8C8' } }, 'Capacity'),
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px', color: '#000000', borderRight: '1px solid #C8C8C8' } }, 'Occupancy'),
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px', color: '#000000', borderRight: '1px solid #C8C8C8' } }, 'Floor'),
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'right', fontWeight: '600', fontSize: '13px', color: '#000000', borderRight: '1px solid #C8C8C8' } }, 'Daily Rate'),
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: '600', fontSize: '13px', color: '#000000', borderRight: '1px solid #C8C8C8' } }, 'Status'),
                React.createElement('th', { style: { padding: '8px 12px', textAlign: 'center', fontWeight: '600', fontSize: '13px', color: '#000000' } }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              null,
              filteredWards.length === 0 ? React.createElement(
                'tr',
                null,
                  React.createElement(
                    'td',
                    { colSpan: 8, style: { padding: '40px', textAlign: 'center', color: '#666' } },
                    'No wards found matching your criteria.'
                  )
              ) : filteredWards.map((ward, index) => {
                const typeInfo = getWardTypeInfo(ward.type);
                const occupancyRate = ward.capacity > 0 ? (ward.currentOccupancy / ward.capacity) * 100 : 0;
                
                return React.createElement(
                  'tr',
                  {
                    key: ward.id,
                    style: {
                      borderBottom: '1px solid #C8C8C8',
                      backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9F9F9'
                    }
                  },
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', borderRight: '1px solid #C8C8C8' } },
                    React.createElement(
                      'div',
                      null,
                      React.createElement(
                        'div',
                        { style: { fontWeight: '600', color: '#000000', fontSize: '13px' } },
                        ward.name
                      ),
                      ward.description && React.createElement(
                        'div',
                        { style: { fontSize: '12px', color: '#6B7280' } },
                        ward.description
                      )
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', borderRight: '1px solid #C8C8C8', fontSize: '13px' } },
                    React.createElement(
                      'span',
                      {
                        style: {
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 6px',
                          borderRadius: '2px',
                          backgroundColor: '#EFF6FF',
                          color: '#1E40AF',
                          fontSize: '12px',
                          fontWeight: '500'
                        }
                      },
                      `${typeInfo.icon} ${typeInfo.label}`
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', borderRight: '1px solid #C8C8C8', textAlign: 'center', fontSize: '13px' } },
                    React.createElement(
                      'div',
                      { style: { textAlign: 'center' } },
                      React.createElement(
                        'div',
                        { style: { fontWeight: '600', fontSize: '14px', color: '#000000' } },
                        ward.capacity
                      ),
                      React.createElement(
                        'div',
                        { style: { fontSize: '11px', color: '#6B7280' } },
                        'beds'
                      )
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', borderRight: '1px solid #C8C8C8', textAlign: 'center', fontSize: '13px' } },
                    React.createElement(
                      'div',
                      { style: { textAlign: 'center' } },
                      React.createElement(
                        'div',
                        { style: { fontWeight: '600', fontSize: '14px', color: '#000000' } },
                        ward.currentOccupancy || 0
                      ),
                      React.createElement(
                        'div',
                        { style: { fontSize: '11px', color: '#6B7280' } },
                        `${Math.round(occupancyRate)}% occupied`
                      )
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', borderRight: '1px solid #C8C8C8', textAlign: 'center', fontSize: '13px', color: '#000000' } },
                    ward.floor || '-'
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', borderRight: '1px solid #C8C8C8', textAlign: 'right', fontSize: '13px' } },
                    ward.dailyRate 
                      ? React.createElement(
                          'span',
                          { style: { fontWeight: '600', color: '#059669', fontSize: '13px' } },
                          `${formatCurrencySync(parseFloat(ward.dailyRate || 0), displayCurrency || 'USD')}/day`
                        )
                      : React.createElement(
                          'span',
                          { style: { fontSize: '12px', color: '#9CA3AF', fontStyle: 'italic' } },
                          'Default rate'
                        )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', borderRight: '1px solid #C8C8C8', fontSize: '13px' } },
                    React.createElement(
                      'span',
                      {
                        style: {
                          padding: '2px 6px',
                          borderRadius: '2px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: ward.isActive ? '#D1FAE5' : '#FEE2E2',
                          color: ward.isActive ? '#065F46' : '#991B1B'
                        }
                      },
                      ward.isActive ? '✅ Active' : '❌ Inactive'
                    )
                  ),
                  React.createElement(
                    'td',
                    { style: { padding: '8px 12px', textAlign: 'center' } },
                    React.createElement(
                      'div',
                      {
                        style: {
                          display: 'flex',
                          gap: '4px',
                          justifyContent: 'center',
                          flexWrap: 'wrap'
                        }
                      },
                      React.createElement(
                        'button',
                        {
                          onClick: () => handleEdit(ward),
                          style: {
                            backgroundColor: '#0078D4',
                            color: '#FFFFFF',
                            border: '1px solid #005A9E',
                            padding: '2px 8px',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '400',
                            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
                          },
                          onMouseOver: (e) => {
                            e.target.style.backgroundColor = '#005A9E';
                          },
                          onMouseOut: (e) => {
                            e.target.style.backgroundColor = '#0078D4';
                          }
                        },
                        '✏️ Edit'
                      ),
                      React.createElement(
                        'button',
                        {
                          onClick: () => handleToggleStatus(ward.id),
                          style: {
                            backgroundColor: ward.isActive ? '#DC2626' : '#059669',
                            color: '#FFFFFF',
                            border: ward.isActive ? '1px solid #991B1B' : '1px solid #047857',
                            padding: '2px 8px',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '400',
                            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
                          },
                          onMouseOver: (e) => {
                            e.target.style.backgroundColor = ward.isActive ? '#991B1B' : '#047857';
                          },
                          onMouseOut: (e) => {
                            e.target.style.backgroundColor = ward.isActive ? '#DC2626' : '#059669';
                          }
                        },
                        ward.isActive ? '❌ Deactivate' : '✅ Activate'
                      ),
                      React.createElement(
                        'button',
                        {
                          onClick: () => handleDelete(ward.id),
                          style: {
                            backgroundColor: '#DC2626',
                            color: '#FFFFFF',
                            border: '1px solid #991B1B',
                            padding: '2px 8px',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '400',
                            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
                          },
                          onMouseOver: (e) => {
                            e.target.style.backgroundColor = '#991B1B';
                          },
                          onMouseOut: (e) => {
                            e.target.style.backgroundColor = '#DC2626';
                          }
                        },
                        '🗑️ Delete'
                      )
                    )
                  )
                );
              })
            )
          )
        )
      )
    ),

    // Add/Edit Ward Modal
    (showAddForm || showEditForm) && React.createElement(
      'div',
      {
        onClick: (e) => {
          // Close modal when clicking outside the form
          if (e.target === e.currentTarget) {
            setShowAddForm(false);
            setShowEditForm(false);
            setEditingWard(null);
            setFormData({
              name: '',
              type: 'GENERAL',
              capacity: '',
              description: '',
              floor: ''
            });
          }
        },
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
            onClick: (e) => e.stopPropagation(), // Prevent modal close when clicking inside
            onKeyDown: (e) => e.stopPropagation(), // Prevent keyboard events from bubbling
            style: {
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
              zIndex: 1001
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
              setEditingWard(null);
              setFormData({
                name: '',
                type: 'GENERAL',
                capacity: '',
                description: '',
                floor: ''
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
          showEditForm ? '✏️ Edit Ward' : '➕ Add New Ward'
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
                'Ward Name *'
              ),
              React.createElement('input', {
                type: 'text',
                name: 'name',
                required: true,
                value: formData.name,
                onChange: handleInputChange,
                autoComplete: 'off',
                placeholder: 'Enter ward name (e.g., Ward A, General Ward)',
                disabled: loading,
                readOnly: false,
                style: {
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: loading ? '#f5f5f5' : 'white',
                  cursor: loading ? 'not-allowed' : 'text'
                }
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
                'Ward Type *'
              ),
              React.createElement(
                'select',
                {
                  name: 'type',
                  required: true,
                  value: formData.type,
                  onChange: handleInputChange,
                  style: {
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }
                },
                ...wardTypes.map(type => React.createElement(
                  'option',
                  { key: type.value, value: type.value },
                  `${type.icon} ${type.label}`
                ))
              )
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
                'Capacity *'
              ),
              React.createElement('input', {
                type: 'number',
                name: 'capacity',
                required: true,
                min: 1,
                value: formData.capacity,
                onChange: handleInputChange,
                onFocus: autoSelectIfZero,
                onMouseDown: autoSelectIfZeroMouseDown,
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
                'Floor'
              ),
              React.createElement('input', {
                type: 'text',
                name: 'floor',
                value: formData.floor,
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
            { style: { marginBottom: '15px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              `Daily Rate (${getCurrencySymbol(displayCurrency || 'USD')})`
            ),
            React.createElement('input', {
              type: 'number',
              name: 'dailyRate',
              min: 0,
              step: '0.01',
              value: formData.dailyRate,
              onChange: handleInputChange,
              onFocus: autoSelectIfZero,
              onMouseDown: autoSelectIfZeroMouseDown,
              placeholder: 'e.g., 1500.00 (optional - uses ward type default if not set)',
              style: {
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }
            }),
            React.createElement(
              'p',
              { style: { margin: '5px 0 0 0', fontSize: '12px', color: '#666' } },
              'Daily charge per bed. If not set, will use default rate for ward type from hospital config.'
            )
          ),
          React.createElement(
            'div',
            { style: { marginBottom: '20px' } },
            React.createElement(
              'label',
              { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold' } },
              'Description'
            ),
            React.createElement('textarea', {
              name: 'description',
              rows: 3,
              value: formData.description,
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
                  setEditingWard(null);
                  setFormData({
                    name: '',
                    type: 'GENERAL',
                    capacity: '',
                    description: '',
                    floor: '',
                    dailyRate: ''
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
              loading ? 'Saving...' : (showEditForm ? 'Update Ward' : 'Create Ward')
            )
          )
        )
      )
    )
  );
};

export default WardManagement;