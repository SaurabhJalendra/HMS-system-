import React, { useState, useEffect } from 'react';
import wardService from '../../lib/api/services/wardService';
import bedService from '../../lib/api/services/bedService';
import admissionService from '../../lib/api/services/admissionService';
import { hasIPDSubModuleAccess } from '../../lib/utils/rolePermissions';
import { UserRole } from '../../types';
import { config } from '../../config/environment';

const IPDDashboard = ({ onBack, isAuthenticated, user }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    wards: { total: 0, active: 0, totalCapacity: 0, totalOccupancy: 0 },
    beds: { total: 0, occupied: 0, available: 0, active: 0 },
    admissions: { total: 0, current: 0, discharged: 0, emergency: 0 }
  });
  const [recentAdmissions, setRecentAdmissions] = useState([]);
  const [wardOccupancy, setWardOccupancy] = useState([]);

  // Check which modules user has access to (at component level for render access)
  const userRole = user?.role as UserRole;
  const canAccessWards = hasIPDSubModuleAccess(userRole, 'wards');
  const canAccessBeds = hasIPDSubModuleAccess(userRole, 'beds');
  const canAccessAdmissions = hasIPDSubModuleAccess(userRole, 'admissions');

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
    } else {
      setError('Please login to access IPD dashboard');
    }
  }, [isAuthenticated]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');
    
    // Check authentication token before making API calls
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('❌ Authentication required. Please login first.');
      setLoading(false);
      return;
    }
    
    try {
      // Load statistics only for modules user has access to
      const promises = [];
      const promiseKeys = [];
      
      if (canAccessWards) {
        promises.push(wardService.getWardStats());
        promiseKeys.push('wardStats');
        promises.push(wardService.getWards({ page: 1, limit: 100 }));
        promiseKeys.push('wards');
      }
      
      if (canAccessBeds) {
        promises.push(bedService.getBedStats());
        promiseKeys.push('bedStats');
      }
      
      if (canAccessAdmissions) {
        promises.push(admissionService.getAdmissionStats());
        promiseKeys.push('admissionStats');
        promises.push(admissionService.getCurrentAdmissions());
        promiseKeys.push('currentAdmissions');
      }
      
      // Execute all allowed requests in parallel
      const results = await Promise.allSettled(promises);
      
      // Process results
      let wardStats = null;
      let bedStats = null;
      let admissionStats = null;
      let currentAdmissions = [];
      let wards = { wards: [] };
      
      results.forEach((result, index) => {
        const key = promiseKeys[index];
        if (result.status === 'fulfilled') {
          if (key === 'wardStats') {
            wardStats = result.value;
          } else if (key === 'bedStats') {
            bedStats = result.value;
          } else if (key === 'admissionStats') {
            admissionStats = result.value;
          } else if (key === 'currentAdmissions') {
            currentAdmissions = result.value || [];
          } else if (key === 'wards') {
            wards = result.value || { wards: [] };
          }
        } else {
          // Log error but don't fail the entire dashboard
          console.warn(`Failed to load ${key}:`, result.reason);
        }
      });

      // Update stats with available data
      setStats({
        wards: canAccessWards && wardStats ? {
          total: wardStats.totalWards || 0,
          active: wardStats.activeWards || 0,
          totalCapacity: wardStats.totalCapacity || 0,
          totalOccupancy: wardStats.totalOccupancy || 0
        } : { total: 0, active: 0, totalCapacity: 0, totalOccupancy: 0 },
        beds: canAccessBeds && bedStats ? {
          total: bedStats.totalBeds || 0,
          occupied: bedStats.occupiedBeds || 0,
          available: bedStats.availableBeds || 0,
          active: bedStats.activeBeds || 0
        } : { total: 0, occupied: 0, available: 0, active: 0 },
        admissions: canAccessAdmissions && admissionStats ? {
          total: admissionStats.totalAdmissions || 0,
          current: admissionStats.currentAdmissions || 0,
          discharged: admissionStats.dischargedToday || 0,
          emergency: admissionStats.admissionsByType?.find(t => t.admissionType === 'EMERGENCY')?._count?.admissionType || 0
        } : { total: 0, current: 0, discharged: 0, emergency: 0 }
      });

      // Set recent admissions (last 5)
      setRecentAdmissions(currentAdmissions.slice(0, 5));

      // Calculate ward occupancy only if user has access
      if (canAccessWards && wards.wards) {
        const occupancyData = wards.wards.map(ward => ({
          id: ward.id,
          name: ward.name,
          type: ward.type,
          capacity: ward.capacity,
          occupancy: ward.currentOccupancy || 0,
          occupancyRate: ward.capacity > 0 ? Math.round((ward.currentOccupancy / ward.capacity) * 100) : 0
        }));
        setWardOccupancy(occupancyData);
      } else {
        setWardOccupancy([]);
      }

      setError('');
    } catch (err) {
      console.error('IPD Dashboard data loading error:', err);
      
      // Check if it's an authentication error
      if (err.response?.status === 401) {
        setError('❌ Authentication failed. Please login again.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        // Optionally reload the page to redirect to login
        // window.location.reload();
      } 
      // Check if it's a permission error
      else if (err.response?.status === 403) {
        // Don't show error for 403s since we're handling them gracefully with Promise.allSettled
        // Individual failed requests are logged but don't break the dashboard
        console.warn('Some IPD data could not be loaded due to insufficient permissions');
      }
      // Check if it's a network error (backend not reachable)
      else if (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || !err.response) {
        // Verify backend is actually running
        try {
          const healthCheck = await fetch(`${config.API_URL.replace('/api', '')}/health`);
          if (healthCheck.ok) {
            setError('❌ Backend is running but API calls are failing. Check authentication token or user permissions.');
          } else {
            setError('❌ Backend server may not be running. Check console (F12) for details.');
          }
        } catch (healthErr) {
          setError('❌ Network error - Backend server may not be running. Check console (F12) for details.');
        }
        console.error('Backend connection error:', {
          message: err.message,
          code: err.code,
          response: err.response?.status,
          stack: err.stack
        });
      }
      // Other API errors
      else {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to load dashboard data';
        setError(`❌ Failed to load dashboard data: ${errorMsg}`);
        console.error('API error response:', err.response?.data);
      }
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getOccupancyColor = (rate) => {
    if (rate >= 90) return '#dc3545'; // Red - Critical
    if (rate >= 75) return '#ffc107'; // Yellow - High
    if (rate >= 50) return '#17a2b8'; // Blue - Medium
    return '#28a745'; // Green - Low
  };

  const getOccupancyStatus = (rate) => {
    if (rate >= 90) return 'Critical';
    if (rate >= 75) return 'High';
    if (rate >= 50) return 'Medium';
    return 'Low';
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
          '🏥 IPD Dashboard'
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          React.createElement(
            'button',
            {
              onClick: loadDashboardData,
              disabled: loading,
              style: {
                backgroundColor: loading ? '#C8C8C8' : '#0078D4',
                color: '#FFFFFF',
                border: '1px solid #005A9E',
                padding: '4px 12px',
                borderRadius: '2px',
                fontSize: '13px',
                fontWeight: '400',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
              },
              onMouseOver: (e) => {
                if (!loading) e.target.style.backgroundColor = '#005A9E';
              },
              onMouseOut: (e) => {
                if (!loading) e.target.style.backgroundColor = '#0078D4';
              }
            },
            loading ? '🔄 Refreshing...' : '🔄 Refresh'
          ),
          React.createElement(
            'button',
            {
              onClick: onBack,
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
            '← Back to Dashboard'
          )
        )
      )
    ),

    // Content
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },

      // Error Message
      error && React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            padding: '12px',
            marginBottom: '8px',
            fontSize: '14px',
            borderRadius: '4px'
          }
        },
        error
      ),

      // Main Statistics Cards - Only show sections user has access to
      React.createElement(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            marginBottom: '8px'
          }
        },
        // Wards Statistics - Only show if user has access
        canAccessWards && React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }
          },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', marginBottom: '15px' } },
            React.createElement(
              'div',
              { style: { fontSize: '32px', marginRight: '15px' } },
              '🏥'
            ),
            React.createElement(
              'div',
              null,
            React.createElement(
              'h3',
              { style: { margin: '0', color: '#111827', fontSize: '16px', fontWeight: '600' } },
              'Wards'
            ),
            React.createElement(
              'p',
              { style: { margin: '0', color: '#6B7280', fontSize: '13px' } },
              'Hospital Wards Overview'
            )
            )
          ),
          React.createElement(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#007bff' } },
                stats.wards.total
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Total Wards'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#28a745' } },
                stats.wards.active
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Active Wards'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' } },
                stats.wards.totalCapacity
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Total Capacity'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#ffc107' } },
                stats.wards.totalOccupancy
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Current Occupancy'
              )
            )
          )
        ),

        // Beds Statistics - Only show if user has access
        canAccessBeds && React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }
          },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', marginBottom: '15px' } },
            React.createElement(
              'div',
              { style: { fontSize: '32px', marginRight: '15px' } },
              '🛏️'
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'h3',
                { style: { margin: '0', color: '#111827', fontSize: '16px', fontWeight: '600' } },
                'Beds'
              ),
              React.createElement(
                'p',
                { style: { margin: '0', color: '#6B7280', fontSize: '13px' } },
                'Bed Management Overview'
              )
            )
          ),
          React.createElement(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#007bff' } },
                stats.beds.total
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Total Beds'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#dc3545' } },
                stats.beds.occupied
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Occupied'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#28a745' } },
                stats.beds.available
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Available'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' } },
                stats.beds.active
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Active Beds'
              )
            )
          )
        ),

        // Admissions Statistics - Only show if user has access
        canAccessAdmissions && React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#FFFFFF',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }
          },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', marginBottom: '15px' } },
            React.createElement(
              'div',
              { style: { fontSize: '32px', marginRight: '15px' } },
              '👥'
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'h3',
                { style: { margin: '0', color: '#111827', fontSize: '16px', fontWeight: '600' } },
                'Admissions'
              ),
              React.createElement(
                'p',
                { style: { margin: '0', color: '#6B7280', fontSize: '13px' } },
                'Patient Admissions Overview'
              )
            )
          ),
          React.createElement(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#007bff' } },
                stats.admissions.total
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Total Admissions'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#ffc107' } },
                stats.admissions.current
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Current Patients'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#28a745' } },
                stats.admissions.discharged
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Discharged Today'
              )
            ),
            React.createElement(
              'div',
              { style: { textAlign: 'center' } },
              React.createElement(
                'div',
                { style: { fontSize: '24px', fontWeight: 'bold', color: '#dc3545' } },
                stats.admissions.emergency
              ),
              React.createElement(
                'div',
                { style: { fontSize: '12px', color: '#666' } },
                'Emergency Cases'
              )
            )
          )
        )
      ),

      // Ward Occupancy Chart - Only show if user has access to wards
      canAccessWards && React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '8px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
          }
        },
        React.createElement(
          'h3',
          { style: { margin: '0 0 16px 0', color: '#111827', fontSize: '16px', fontWeight: '600', paddingBottom: '8px', borderBottom: '1px solid #E5E7EB' } },
          '📊 Ward Occupancy Status'
        ),
        wardOccupancy.length === 0 ? React.createElement(
          'div',
          { style: { textAlign: 'center', color: '#666', padding: '40px' } },
          'No ward data available'
        ) : React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '15px'
            }
          },
          ...wardOccupancy.map(ward => {
            const occupancyColor = getOccupancyColor(ward.occupancyRate);
            const occupancyStatus = getOccupancyStatus(ward.occupancyRate);
            
            return React.createElement(
              'div',
              {
                key: ward.id,
                style: {
                  padding: '15px',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  backgroundColor: '#f8f9fa'
                }
              },
              React.createElement(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
                React.createElement(
                  'div',
                  { style: { fontWeight: 'bold', color: '#333' } },
                  `🏥 ${ward.name}`
                ),
                React.createElement(
                  'span',
                  {
                    style: {
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      backgroundColor: occupancyColor + '20',
                      color: occupancyColor
                    }
                  },
                  `${occupancyStatus} (${ward.occupancyRate}%)`
                )
              ),
              React.createElement(
                'div',
                { style: { marginBottom: '8px' } },
                React.createElement(
                  'div',
                  {
                    style: {
                      width: '100%',
                      height: '8px',
                      backgroundColor: '#e9ecef',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }
                  },
                  React.createElement(
                    'div',
                    {
                      style: {
                        width: `${ward.occupancyRate}%`,
                        height: '100%',
                        backgroundColor: occupancyColor,
                        transition: 'width 0.3s ease'
                      }
                    }
                  )
                )
              ),
              React.createElement(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' } },
                React.createElement('span', null, `${ward.occupancy} / ${ward.capacity} beds`),
                React.createElement('span', null, `${ward.type}`)
              )
            );
          })
        )
      ),

      // Recent Admissions - Only show if user has access to admissions
      canAccessAdmissions && React.createElement(
        'div',
        {
          style: {
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            border: '1px solid #e9ecef'
          }
        },
        React.createElement(
          'h3',
          { style: { margin: '0 0 20px 0', color: '#333', fontSize: '20px' } },
          '🕒 Recent Admissions'
        ),
        recentAdmissions.length === 0 ? React.createElement(
          'div',
          { style: { textAlign: 'center', color: '#666', padding: '40px' } },
          'No recent admissions found'
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
                React.createElement('th', { style: { padding: '12px', textAlign: 'left', fontWeight: 'bold' } }, 'Status')
              )
            ),
            React.createElement(
              'tbody',
              null,
              ...recentAdmissions.map((admission, index) => {
                const admissionDate = admission.admissionDate ? new Date(admission.admissionDate).toLocaleDateString() : '-';
                const typeInfo = {
                  EMERGENCY: { icon: '🚨', label: 'Emergency' },
                  PLANNED: { icon: '📅', label: 'Planned' },
                  ELECTIVE: { icon: '📅', label: 'Planned' },
                  TRANSFER: { icon: '🔄', label: 'Transfer' },
                  OBSERVATION: { icon: '👁️', label: 'Observation' },
                  SURGICAL: { icon: '⚕️', label: 'Surgical' },
                  MEDICAL: { icon: '🩺', label: 'Medical' }
                }[admission.admissionType] || { icon: '🏥', label: admission.admissionType };
                
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
                      admission.patient?.name || 'Unknown Patient'
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
                        `🏥 ${admission.ward?.name || 'Unknown Ward'}`
                      ),
                      React.createElement(
                        'div',
                        { style: { fontSize: '12px', color: '#666' } },
                        `🛏️ Bed ${admission.bed?.bedNumber || 'Unknown'}`
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
                    admissionDate
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
                          backgroundColor: '#007bff20',
                          color: '#007bff'
                        }
                      },
                      '🏥 Admitted'
                    )
                  )
                );
              })
            )
          )
        )
      )
    )
  );
};

export default IPDDashboard;