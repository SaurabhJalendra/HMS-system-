import React, { useState, useEffect } from 'react';
import { 
  getRoleBasedModules, 
  getRoleDisplayInfo, 
  getRoleQuickActions,
  getRoleDashboardWidgets,
  hasModuleAccess,
  shouldShowAvailableModules,
} from '../../lib/utils/rolePermissions';
import LoadingSpinner from '../common/LoadingSpinner';
import InfoButton from '../common/InfoButton';
import { getInfoContent } from '../../lib/infoContent';
import userService from '../../lib/api/services/userService';
import patientService from '../../lib/api/services/patientService';
import appointmentService from '../../lib/api/services/appointmentService';
import { UserRole } from '../../lib/api/types';
import {
  loadDoctorDashboardData,
  loadReceptionistDashboardData,
  loadLabTechDashboardData,
  loadPharmacyDashboardData,
} from '../../lib/utils/roleDashboardData';

const RoleBasedDashboard = ({ user, onNavigate, onLogout, currentModule = 'dashboard' }: any) => {
  const [dashboardData, setDashboardData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  const userRole = user?.role;
  const roleInfo = getRoleDisplayInfo(userRole);
  const availableModules = getRoleBasedModules(userRole);
  const quickActions = getRoleQuickActions(userRole);
  const dashboardWidgets = getRoleDashboardWidgets(userRole);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second

    return () => clearInterval(timer); // Cleanup on unmount
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [userRole, user?.id]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      if (userRole === UserRole.ADMIN) {
        const [userStatsResult, patientStatsResult, appointmentStatsResult, usersListResult, patientsListResult] = await Promise.allSettled([
          userService.getUserStats(),
          patientService.getPatientStats(),
          appointmentService.getAppointmentStats(),
          userService.getUsers({ page: 1, limit: 5 }),
          patientService.getPatients({ page: 1, limit: 5 }),
        ]);

        const userStats = userStatsResult.status === 'fulfilled' ? userStatsResult.value : null;
        const patientStats = patientStatsResult.status === 'fulfilled' ? patientStatsResult.value : null;
        const appointmentStats = appointmentStatsResult.status === 'fulfilled' ? appointmentStatsResult.value : null;
        const usersList = usersListResult.status === 'fulfilled' ? usersListResult.value : null;
        const patientsList = patientsListResult.status === 'fulfilled' ? patientsListResult.value : null;

        const recentUsers = (usersList?.users || []).map((u) => ({
          name: u.fullName,
          time: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
          status: u.isActive ? 'Active' : 'Inactive',
          role: u.role,
        }));
        const recentPatients = (patientsList?.patients || []).map((p) => ({
          name: p.name,
          time: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '',
          phone: p.phone,
        }));

        setDashboardData({
          totalUsers: userStats?.totalUsers ?? 0,
          totalPatients: patientStats?.totalPatients ?? 0,
          totalAppointments: appointmentStats?.totalAppointments ?? 0,
          systemAlerts: [],
          recentActivities: [],
          userActivity: [],
          recentUsers,
          recentPatients,
        });
      } else if (userRole === UserRole.DOCTOR && user?.id) {
        const data = await loadDoctorDashboardData(user.id);
        setDashboardData(data);
      } else if (userRole === UserRole.RECEPTIONIST) {
        const data = await loadReceptionistDashboardData();
        setDashboardData(data);
      } else if (userRole === UserRole.LAB_TECH) {
        const data = await loadLabTechDashboardData();
        setDashboardData(data);
      } else if (userRole === UserRole.PHARMACY) {
        const data = await loadPharmacyDashboardData();
        setDashboardData(data);
      } else {
        setDashboardData({});
      }
    } catch (err) {
      console.error('Dashboard data error:', err);
      setError('Error loading dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = (action, module) => {
    if (hasModuleAccess(userRole, module)) {
      onNavigate(module, action);
    }
  };

  const getWidgetContainerStyle = () => ({
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: 0,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    minHeight: '200px'
  });

  const getWidgetTitleStyle = () => ({
    fontSize: '16px',
    fontWeight: '600',
    color: '#111827',
    margin: 0,
    marginBottom: '16px'
  });

  const formatStatDisplay = (key, value) => {
    if (value === undefined || value === null) return 0;
    if ((key === 'monthlyRevenue' || key === 'totalRevenue') && typeof value === 'number') {
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    return value;
  };

  const renderStatsWidget = (widget) => {
    const stats = widget.data.map(statKey => ({
      key: statKey,
      value: formatStatDisplay(statKey, dashboardData[statKey]),
      label: statKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
    }));

    return React.createElement(
      'div',
      { style: getWidgetContainerStyle() },
      React.createElement(
        'h3',
        { style: getWidgetTitleStyle() },
        widget.title
      ),
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', flex: '1' } },
        stats.map(stat => React.createElement(
          'div',
          { key: stat.key, style: { textAlign: 'center' } },
          React.createElement(
            'div',
            { style: { fontSize: '24px', fontWeight: '600', color: '#2563EB' } },
            stat.value
          ),
          React.createElement(
            'div',
            { style: { fontSize: '12px', color: '#6B7280' } },
            stat.label
          )
        ))
      )
    );
  };

  const renderListWidget = (widget) => {
    const listData = dashboardData[widget.data] || [];
    
    return React.createElement(
      'div',
      { style: getWidgetContainerStyle() },
      React.createElement(
        'h3',
        { style: getWidgetTitleStyle() },
        widget.title
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', justifyContent: listData.length === 0 ? 'center' : 'flex-start' } },
        listData.length === 0 ? React.createElement(
          'p',
          { style: { color: '#6B7280', textAlign: 'center', padding: '16px 0', fontSize: '14px', margin: 0 } },
          'No data available'
        ) : listData.slice(0, 5).map((item, index) => React.createElement(
          'div',
          { key: index, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F3F4F6' } },
          React.createElement(
            'div',
            null,
            React.createElement(
              'div',
              { style: { fontWeight: '500', color: '#111827', fontSize: '14px' } },
              item.name || item.patient || item.user || 'N/A'
            ),
            (item.time || item.role || item.phone) && React.createElement(
              'div',
              { style: { fontSize: '12px', color: '#6B7280' } },
              [item.role, item.time, item.phone].filter(Boolean).join(' · ')
            )
          ),
          item.status && React.createElement(
            'span',
            { style: { padding: '4px 8px', fontSize: '11px', fontWeight: '500', backgroundColor: item.status === 'Active' || item.status === 'Paid' ? '#D1FAE5' : '#FEF3C7', color: item.status === 'Active' || item.status === 'Paid' ? '#065F46' : '#92400E' } },
            item.status
          )
        ))
      )
    );
  };

  const renderChartWidget = (widget) => {
    const chartData = dashboardData[widget.data] || [];
    
    return React.createElement(
      'div',
      { style: getWidgetContainerStyle() },
      React.createElement(
        'h3',
        { style: getWidgetTitleStyle() },
        widget.title
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '1' } },
        chartData.length === 0 ? React.createElement(
          'p',
          { style: { color: '#6B7280', textAlign: 'center', padding: '16px 0', fontSize: '14px', margin: 0 } },
          'No chart data available'
        ) : React.createElement(
          'div',
          { style: { width: '100%', padding: '16px', backgroundColor: '#F9FAFB', borderRadius: '6px', border: '1px solid #E5E7EB' } },
          React.createElement(
            'p',
            { style: { color: '#6B7280', textAlign: 'center', fontSize: '14px' } },
            'Chart visualization will be implemented here'
          )
        )
      )
    );
  };

  const renderWidget = (widget) => {
    switch (widget.type) {
      case 'stats':
        return renderStatsWidget(widget);
      case 'chart':
        return renderChartWidget(widget);
      case 'schedule':
      case 'appointments':
      case 'tests':
      case 'prescriptions':
      case 'alerts':
      case 'recent':
      case 'patients':
      case 'queue':
      case 'results':
      case 'equipment':
      case 'inventory':
        return renderListWidget(widget);
      default:
        return React.createElement(
          'div',
          { style: getWidgetContainerStyle() },
          React.createElement(
            'h3',
            { style: getWidgetTitleStyle() },
            widget.title
          ),
          React.createElement(
            'p',
            { style: { color: '#6B7280', fontSize: '14px' } },
            'Widget type not implemented yet'
          )
        );
    }
  };

  if (loading) {
    return React.createElement(
      'div',
      { className: 'flex justify-center items-center h-64' },
      React.createElement(LoadingSpinner, { text: 'Loading dashboard...' })
    );
  }

  return React.createElement(
    'div',
    { style: { minHeight: '100vh', backgroundColor: '#F0F0F0', padding: '8px', margin: 0, boxSizing: 'border-box' } },
    
    // Welcome Header - Desktop style
    React.createElement(
      'div',
      { style: { backgroundColor: '#F3F3F3', color: '#000000', padding: '8px 12px', marginBottom: '8px', borderBottom: '1px solid #C8C8C8' } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        React.createElement(
          'div',
          null,
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            React.createElement(
              'h1',
              { style: { fontSize: '24px', fontWeight: '600', margin: 0, marginBottom: '8px' } },
              `Welcome, ${user.fullName}!`
            ),
            React.createElement(InfoButton, {
              title: getInfoContent('dashboard').title,
              content: getInfoContent('dashboard').content,
              size: 'md',
              variant: 'primary',
              icon: 'ℹ️'
            })
          ),
          React.createElement(
            'p',
            { style: { fontSize: '12px', color: '#666666', margin: 0 } },
            `${roleInfo.label} Dashboard - ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
          )
        ),
        React.createElement(
          'div',
          { style: { textAlign: 'right' } },
          React.createElement(
            'div',
            { style: { fontSize: '20px', fontWeight: '600', marginBottom: '4px' } },
            currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          ),
          React.createElement(
            'div',
            { style: { fontSize: '11px', color: '#666666', marginBottom: '8px' } },
            'Current Time'
          ),
          React.createElement(
            'button',
            {
              onClick: onLogout,
              style: {
                backgroundColor: '#FFFFFF',
                color: '#000000',
                border: '1px solid #C8C8C8',
                padding: '4px 12px',
                fontSize: '13px',
                fontWeight: '400',
                cursor: 'pointer',
                boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              },
              onMouseOver: (e) => {
                e.target.style.backgroundColor = '#E8E8E8';
              },
              onMouseOut: (e) => {
                e.target.style.backgroundColor = '#FFFFFF';
              }
            },
            '🚪 Logout'
          )
        )
      )
    ),

    // Quick Actions
    quickActions.length > 0 && React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', padding: '20px', marginBottom: '16px', borderRadius: '8px', boxSizing: 'border-box' } },
      React.createElement(
        'h2',
        { style: { fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0, marginBottom: '16px' } },
        'Quick Actions'
      ),
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' } },
        quickActions.map((action, index) => React.createElement(
          'button',
          {
            key: index,
            onClick: () => handleQuickAction(action.action, action.module),
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '12px',
              backgroundColor: '#F9FAFB',
              border: '1px solid #E5E7EB',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px'
            }
          },
          React.createElement(
            'div',
            { style: { fontSize: '20px', marginRight: '12px' } },
            action.icon
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'div',
              { style: { fontWeight: '500', color: '#111827', marginBottom: '4px' } },
              action.name
            ),
            React.createElement(
              'div',
              { style: { fontSize: '12px', color: '#6B7280' } },
              `Go to ${action.module}`
            )
          )
        ))
      )
    ),

    // Dashboard Widgets
    React.createElement(
      'div',
      { 
        style: { 
          display: 'grid', 
          gridTemplateColumns: dashboardWidgets.length <= 3 ? `repeat(${dashboardWidgets.length}, 1fr)` : 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px', 
          marginBottom: '24px', 
          alignItems: 'stretch',
          width: '100%',
          boxSizing: 'border-box'
        } 
      },
      dashboardWidgets.map((widget, index) => React.createElement(
        'div',
        { key: index, style: { display: 'flex', minWidth: 0, width: '100%', boxSizing: 'border-box' } },
        renderWidget(widget)
      ))
    ),

    // Available Modules (exclude current dashboard). Lab techs use Quick Actions only.
    shouldShowAvailableModules(userRole) && React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', padding: '20px', marginBottom: '16px', borderRadius: '8px', boxSizing: 'border-box' } },
      React.createElement(
        'h2',
        { style: { fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0, marginBottom: '16px' } },
        'Available Modules'
      ),
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' } },
        Object.entries(availableModules)
          .filter(([moduleKey]) => moduleKey !== currentModule) // Exclude current module from available modules
          .map(([moduleKey, module]) => React.createElement(
            'div',
            {
              key: moduleKey,
              onClick: () => onNavigate(moduleKey),
              role: 'button',
              tabIndex: 0,
              onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(moduleKey); } },
              style: {
                padding: '16px',
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                cursor: 'pointer',
                textAlign: 'center',
                fontSize: '14px',
                position: 'relative'
              }
            },
            React.createElement(
              'div',
              { style: { position: 'absolute', top: '6px', right: '6px' } },
              React.createElement(InfoButton, {
                title: getInfoContent(moduleKey).title,
                content: getInfoContent(moduleKey).content,
                size: 'xs',
                variant: 'info'
              })
            ),
            React.createElement(
              'div',
              { style: { fontSize: '24px', marginBottom: '8px' } },
              module.icon
            ),
            React.createElement(
              'div',
              { style: { fontWeight: '500', color: '#111827' } },
              module.name
            )
          ))
      )
    ),

    // Error Display
    error && React.createElement(
      'div',
      { style: { backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '12px', marginBottom: '24px', fontSize: '14px' } },
      error
    )
  );
};

export default RoleBasedDashboard;
