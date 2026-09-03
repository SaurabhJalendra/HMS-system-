import { UserRole } from '../api/types';

// Define module permissions for each role
export const rolePermissions = {
  [UserRole.ADMIN]: {
    modules: ['dashboard', 'opdFlow', 'patients', 'appointments', 'consultations', 'prescriptions', 'labTests', 'medicines', 'billing', 'users', 'configuration', 'ipd', 'ot'],
    canManageUsers: true,
    canViewReports: true,
    canManageSystem: true,
    canAccessFinancials: true,
  },
  [UserRole.DOCTOR]: {
    modules: ['dashboard', 'opdFlow', 'patients', 'appointments', 'consultations', 'prescriptions', 'labTests', 'ipd', 'ot'],
    canManageUsers: false,
    canViewReports: true,
    canManageSystem: false,
    canAccessFinancials: false,
  },
  [UserRole.RECEPTIONIST]: {
    modules: ['dashboard', 'opdFlow', 'patients', 'appointments', 'billing', 'ipd', 'ot'],
    canManageUsers: false,
    canViewReports: true,
    canManageSystem: false,
    canAccessFinancials: true,
  },
  [UserRole.LAB_TECH]: {
    modules: ['dashboard', 'patients', 'labTests'],
    canManageUsers: false,
    canViewReports: false,
    canManageSystem: false,
    canAccessFinancials: false,
  },
  [UserRole.PHARMACY]: {
    modules: ['dashboard', 'patients', 'prescriptions', 'medicines'],
    canManageUsers: false,
    canViewReports: false,
    canManageSystem: false,
    canAccessFinancials: false,
  },
  // IPD-specific roles
  [UserRole.NURSE]: {
    modules: ['dashboard', 'patients', 'ipd', 'ot'],
    canManageUsers: false,
    canViewReports: false,
    canManageSystem: false,
    canAccessFinancials: false,
  },
  [UserRole.WARD_MANAGER]: {
    modules: ['dashboard', 'patients', 'ipd', 'ot'],
    canManageUsers: false,
    canViewReports: true,
    canManageSystem: false,
    canAccessFinancials: false,
  },
  [UserRole.NURSING_SUPERVISOR]: {
    modules: ['dashboard', 'patients', 'ipd', 'ot'],
    canManageUsers: false,
    canViewReports: true,
    canManageSystem: false,
    canAccessFinancials: false,
  },
};

// Get available modules for a role
export const getAvailableModules = (userRole) => {
  return rolePermissions[userRole]?.modules || [];
};

// Check if user has access to a specific module
export const hasModuleAccess = (userRole, module) => {
  const permissions = rolePermissions[userRole];
  return permissions ? permissions.modules.includes(module) : false;
};

// Check specific permissions
export const canManageUsers = (userRole) => {
  return rolePermissions[userRole]?.canManageUsers || false;
};

export const canViewReports = (userRole) => {
  return rolePermissions[userRole]?.canViewReports || false;
};

export const canManageSystem = (userRole) => {
  return rolePermissions[userRole]?.canManageSystem || false;
};

export const canAccessFinancials = (userRole) => {
  return rolePermissions[userRole]?.canAccessFinancials || false;
};

export const roleUsesConsultationFee = (userRole) => {
  return userRole === UserRole.DOCTOR || userRole === UserRole.ADMIN;
};

// Get role-specific module definitions
export const getRoleBasedModules = (userRole) => {
  const allModules = {
    dashboard: { name: 'Dashboard', icon: '🏠', color: 'blue' },
    opdFlow: { name: 'OPD Flow', icon: '🔄', color: 'cyan' },
    patients: { name: 'Patients', icon: '👥', color: 'green' },
    appointments: { name: 'Appointments', icon: '📅', color: 'blue' },
    consultations: { name: 'Consultations', icon: '🩺', color: 'purple' },
    prescriptions: { name: 'Prescriptions', icon: '💊', color: 'yellow' },
    labTests: { name: 'Lab Tests', icon: '🧪', color: 'red' },
    medicines: { name: 'Medicines', icon: '💉', color: 'pink' },
    billing: { name: 'Billing', icon: '💰', color: 'indigo' },
    users: { name: 'Users', icon: '👤', color: 'gray' },
    configuration: { name: 'Settings', icon: '⚙️', color: 'slate' },
    ipd: { name: 'IPD Management', icon: '🏥', color: 'teal' },
    ot: { name: 'OT', icon: '🩺', color: 'orange' }
  };

  const availableModules = getAvailableModules(userRole);
  const modules = {};

  availableModules.forEach(moduleKey => {
    if (allModules[moduleKey]) {
      modules[moduleKey] = allModules[moduleKey];
    }
  });

  return modules;
};

// Get role display information
export const getRoleDisplayInfo = (role) => {
  const roleInfo = {
    [UserRole.ADMIN]: { label: 'Administrator', icon: '👨‍💼', color: 'red' },
    [UserRole.DOCTOR]: { label: 'Doctor', icon: '👨‍⚕️', color: 'blue' },
    [UserRole.RECEPTIONIST]: { label: 'Receptionist', icon: '👩‍💼', color: 'green' },
    [UserRole.LAB_TECH]: { label: 'Lab Technician', icon: '🧪', color: 'purple' },
    [UserRole.PHARMACY]: { label: 'Pharmacist', icon: '💊', color: 'yellow' },
    [UserRole.NURSE]: { label: 'Nurse', icon: '👩‍⚕️', color: 'pink' },
    [UserRole.WARD_MANAGER]: { label: 'Ward Manager', icon: '🏥', color: 'teal' },
    [UserRole.NURSING_SUPERVISOR]: { label: 'Nursing Supervisor', icon: '👩‍⚕️', color: 'purple' },
  };

  return roleInfo[role] || { label: role, icon: '👤', color: 'gray' };
};

// Get role-specific quick actions
export const getRoleQuickActions = (userRole) => {
  const quickActions = {
    [UserRole.ADMIN]: [
      { name: 'Add User', icon: '👤', action: 'addUser', module: 'users' },
      { name: 'System Stats', icon: '📊', action: 'viewStats', module: 'dashboard' },
      { name: 'Backup Data', icon: '💾', action: 'backup', module: 'configuration' },
    ],
    [UserRole.DOCTOR]: [
      { name: 'Today\'s Appointments', icon: '📅', action: 'todayAppointments', module: 'appointments' },
      { name: 'Pending Consultations', icon: '🩺', action: 'pendingConsultations', module: 'consultations' },
      { name: 'Write Prescription', icon: '💊', action: 'newPrescription', module: 'prescriptions' },
    ],
    [UserRole.RECEPTIONIST]: [
      { name: 'Register Patient', icon: '👥', action: 'addPatient', module: 'patients' },
      { name: 'Book Appointment', icon: '📅', action: 'bookAppointment', module: 'appointments' },
      { name: 'Generate Bill', icon: '💰', action: 'generateBill', module: 'billing' },
    ],
    [UserRole.LAB_TECH]: [
      { name: 'Pending Tests', icon: '🧪', action: 'pendingTests', module: 'labTests' },
      { name: 'Enter Results', icon: '📝', action: 'enterResults', module: 'labTests' },
      { name: 'Test Reports', icon: '📊', action: 'testReports', module: 'labTests' },
    ],
    [UserRole.PHARMACY]: [
      { name: 'Pending Prescriptions', icon: '💊', action: 'pendingPrescriptions', module: 'prescriptions' },
      { name: 'Dispense Medicine', icon: '💉', action: 'dispenseMedicine', module: 'medicines' },
      { name: 'Stock Alert', icon: '⚠️', action: 'stockAlert', module: 'medicines' },
    ],
  };

  return quickActions[userRole] || [];
};

// Get role-specific dashboard widgets
export const getRoleDashboardWidgets = (userRole) => {
  const widgets = {
    [UserRole.ADMIN]: [
      { type: 'stats', title: 'System Overview', data: ['totalUsers', 'totalPatients', 'totalAppointments'] },
      { type: 'chart', title: 'User Activity', data: 'userActivity' },
      { type: 'alerts', title: 'System Alerts', data: 'systemAlerts' },
      { type: 'recent', title: 'Recent Activities', data: 'recentActivities' },
      { type: 'recent', title: 'Recent Users', data: 'recentUsers' },
      { type: 'recent', title: 'Recent Patients', data: 'recentPatients' },
    ],
    [UserRole.DOCTOR]: [
      { type: 'stats', title: 'My Overview', data: ['todayAppointments', 'pendingConsultations', 'totalPatients'] },
      { type: 'schedule', title: 'Today\'s Schedule', data: 'todaySchedule' },
      { type: 'patients', title: 'Recent Patients', data: 'recentPatients' },
      { type: 'alerts', title: 'Medical Alerts', data: 'medicalAlerts' },
    ],
    [UserRole.RECEPTIONIST]: [
      { type: 'stats', title: 'Reception Overview', data: ['todayAppointments', 'newPatients', 'pendingBills'] },
      { type: 'appointments', title: 'Today\'s Appointments', data: 'todayAppointmentsList' },
      { type: 'queue', title: 'Patient Queue', data: 'patientQueue' },
      { type: 'stats', title: 'Billing (30 days)', data: ['paidBills', 'totalBills', 'monthlyRevenue'] },
    ],
    [UserRole.LAB_TECH]: [
      { type: 'stats', title: 'Lab Overview', data: ['pendingTests', 'completedToday', 'totalSamples'] },
      { type: 'tests', title: 'Pending Tests', data: 'pendingTestsList' },
      { type: 'results', title: 'Recent Results', data: 'recentResults' },
      { type: 'equipment', title: 'Equipment Status', data: 'equipmentStatus' },
    ],
    [UserRole.PHARMACY]: [
      { type: 'stats', title: 'Pharmacy Overview', data: ['pendingPrescriptions', 'lowStock', 'dispensedToday'] },
      { type: 'prescriptions', title: 'Pending Prescriptions', data: 'pendingPrescriptionsList' },
      { type: 'inventory', title: 'Low Stock Alert', data: 'lowStockItems' },
    ],
  };

  return widgets[userRole] || [];
};

// ===== IPD SUB-MODULE PERMISSIONS =====

// Define IPD inner module permissions for each role
export const ipdSubModulePermissions = {
  [UserRole.ADMIN]: {
    // Admin has access to all IPD sub-modules
    subModules: ['dashboard', 'wards', 'beds', 'admissions', 'patientCare', 'nursingCare', 'discharge', 'billing'],
  },
  [UserRole.DOCTOR]: {
    subModules: ['dashboard', 'patientCare', 'discharge'],
  },
  [UserRole.NURSING_SUPERVISOR]: {
    subModules: ['dashboard', 'nursingCare'],
  },
  [UserRole.WARD_MANAGER]: {
    subModules: ['dashboard', 'wards', 'beds'],
  },
  [UserRole.RECEPTIONIST]: {
    subModules: ['dashboard', 'admissions', 'billing'],
  },
  [UserRole.NURSE]: {
    subModules: ['dashboard', 'patientCare', 'nursingCare', 'discharge'],
  },
  // Other roles don't have IPD access, but if they do, they get dashboard only
  [UserRole.LAB_TECH]: {
    subModules: ['dashboard'],
  },
  [UserRole.PHARMACY]: {
    subModules: ['dashboard'],
  },
};

// Check if user has access to a specific IPD sub-module
export const hasIPDSubModuleAccess = (userRole: UserRole, subModule: string): boolean => {
  const permissions = ipdSubModulePermissions[userRole];
  if (!permissions) {
    return false;
  }
  return permissions.subModules.includes(subModule);
};

// Get available IPD sub-modules for a role
export const getAvailableIPDSubModules = (userRole: UserRole): string[] => {
  const permissions = ipdSubModulePermissions[userRole];
  return permissions ? permissions.subModules : [];
};

// ===== OT SUB-MODULE PERMISSIONS =====
export const otSubModulePermissions: Record<string, { subModules: string[] }> = {
  [UserRole.ADMIN]: {
    subModules: ['dashboard', 'otRooms', 'surgeryScheduling', 'surgeryManagement', 'preOperativeCare', 'postOperativeCare', 'otStaffManagement', 'otInventory', 'otBilling'],
  },
  [UserRole.DOCTOR]: {
    subModules: ['dashboard', 'surgeryScheduling', 'surgeryManagement', 'preOperativeCare', 'postOperativeCare', 'otStaffManagement'],
  },
  [UserRole.RECEPTIONIST]: {
    subModules: ['dashboard', 'otRooms', 'surgeryScheduling', 'otBilling'],
  },
  [UserRole.NURSE]: {
    subModules: ['dashboard', 'preOperativeCare', 'postOperativeCare', 'otInventory'],
  },
  [UserRole.NURSING_SUPERVISOR]: {
    subModules: ['dashboard', 'preOperativeCare', 'postOperativeCare', 'otInventory'],
  },
  [UserRole.WARD_MANAGER]: {
    subModules: ['dashboard', 'otRooms'],
  },
  [UserRole.LAB_TECH]: { subModules: ['dashboard'] },
  [UserRole.PHARMACY]: { subModules: ['dashboard'] },
};

export const hasOTSubModuleAccess = (userRole: UserRole, subModule: string): boolean => {
  const permissions = otSubModulePermissions[userRole];
  if (!permissions) return false;
  return permissions.subModules.includes(subModule);
};

export const getAvailableOTSubModules = (userRole: UserRole): string[] => {
  const permissions = otSubModulePermissions[userRole];
  return permissions ? permissions.subModules : [];
};