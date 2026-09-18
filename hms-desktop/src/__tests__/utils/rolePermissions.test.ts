import { describe, it, expect } from 'vitest';
import {
  getAvailableModules,
  hasModuleAccess,
  canManageUsers,
  canViewReports,
  canManageSystem,
  canAccessFinancials,
  getRoleDisplayInfo,
  hasIPDSubModuleAccess,
  getAvailableIPDSubModules,
  roleUsesConsultationFee,
  getRoleQuickActions,
  shouldShowAvailableModules,
  canEditPrescription,
  canMutatePatientRecord,
} from '../../lib/utils/rolePermissions';
import { UserRole } from '../../lib/api/types';

describe('Role Permissions', () => {
  describe('getAvailableModules', () => {
    it('should return all modules for ADMIN', () => {
      const modules = getAvailableModules(UserRole.ADMIN);
      expect(modules).toContain('dashboard');
      expect(modules).toContain('patients');
      expect(modules).toContain('users');
      expect(modules).toContain('configuration');
      expect(modules.length).toBeGreaterThan(5);
    });

    it('should return limited modules for DOCTOR', () => {
      const modules = getAvailableModules(UserRole.DOCTOR);
      expect(modules).toContain('dashboard');
      expect(modules).toContain('patients');
      expect(modules).toContain('consultations');
      expect(modules).toContain('configuration');
      expect(modules).not.toContain('users');
    });

    it('should return appropriate modules for RECEPTIONIST', () => {
      const modules = getAvailableModules(UserRole.RECEPTIONIST);
      expect(modules).toContain('dashboard');
      expect(modules).toContain('patients');
      expect(modules).toContain('appointments');
      expect(modules).toContain('billing');
      expect(modules).toContain('configuration');
    });

    it('should return empty array for unknown role', () => {
      const modules = getAvailableModules('UNKNOWN_ROLE' as UserRole);
      expect(modules).toEqual([]);
    });
  });

  describe('hasModuleAccess', () => {
    it('should return true for ADMIN accessing any module', () => {
      expect(hasModuleAccess(UserRole.ADMIN, 'users')).toBe(true);
      expect(hasModuleAccess(UserRole.ADMIN, 'configuration')).toBe(true);
      expect(hasModuleAccess(UserRole.ADMIN, 'patients')).toBe(true);
    });

    it('should return false for DOCTOR accessing restricted modules', () => {
      expect(hasModuleAccess(UserRole.DOCTOR, 'users')).toBe(false);
      expect(hasModuleAccess(UserRole.DOCTOR, 'configuration')).toBe(true);
    });

    it('should return true for DOCTOR accessing allowed modules', () => {
      expect(hasModuleAccess(UserRole.DOCTOR, 'patients')).toBe(true);
      expect(hasModuleAccess(UserRole.DOCTOR, 'consultations')).toBe(true);
      expect(hasModuleAccess(UserRole.DOCTOR, 'prescriptions')).toBe(true);
    });

    it('should return false for unknown role except app-updates configuration', () => {
      expect(hasModuleAccess('UNKNOWN_ROLE' as UserRole, 'dashboard')).toBe(false);
      expect(hasModuleAccess('UNKNOWN_ROLE' as UserRole, 'configuration')).toBe(true);
    });
  });

  describe('canManageUsers', () => {
    it('should return true only for ADMIN', () => {
      expect(canManageUsers(UserRole.ADMIN)).toBe(true);
      expect(canManageUsers(UserRole.DOCTOR)).toBe(false);
      expect(canManageUsers(UserRole.RECEPTIONIST)).toBe(false);
      expect(canManageUsers(UserRole.LAB_TECH)).toBe(false);
      expect(canManageUsers(UserRole.PHARMACY)).toBe(false);
    });
  });

  describe('canViewReports', () => {
    it('should return true for roles with report access', () => {
      expect(canViewReports(UserRole.ADMIN)).toBe(true);
      expect(canViewReports(UserRole.DOCTOR)).toBe(true);
      expect(canViewReports(UserRole.RECEPTIONIST)).toBe(true);
      expect(canViewReports(UserRole.WARD_MANAGER)).toBe(true);
    });

    it('should return false for roles without report access', () => {
      expect(canViewReports(UserRole.LAB_TECH)).toBe(false);
      expect(canViewReports(UserRole.PHARMACY)).toBe(false);
      expect(canViewReports(UserRole.NURSE)).toBe(false);
    });
  });

  describe('canManageSystem', () => {
    it('should return true only for ADMIN', () => {
      expect(canManageSystem(UserRole.ADMIN)).toBe(true);
      expect(canManageSystem(UserRole.DOCTOR)).toBe(false);
      expect(canManageSystem(UserRole.RECEPTIONIST)).toBe(false);
    });
  });

  describe('canAccessFinancials', () => {
    it('should return true for ADMIN and RECEPTIONIST', () => {
      expect(canAccessFinancials(UserRole.ADMIN)).toBe(true);
      expect(canAccessFinancials(UserRole.RECEPTIONIST)).toBe(true);
    });

    it('should return false for other roles', () => {
      expect(canAccessFinancials(UserRole.DOCTOR)).toBe(false);
      expect(canAccessFinancials(UserRole.LAB_TECH)).toBe(false);
      expect(canAccessFinancials(UserRole.PHARMACY)).toBe(false);
    });
  });

  describe('canEditPrescription', () => {
    const activeOwn = { status: 'ACTIVE', doctorId: 'doc-1' };

    it('shows Edit for doctor on their own active prescription', () => {
      expect(canEditPrescription(UserRole.DOCTOR, activeOwn, 'doc-1')).toBe(true);
    });

    it('hides Edit for doctor on another doctor\'s prescription', () => {
      expect(canEditPrescription(UserRole.DOCTOR, activeOwn, 'doc-2')).toBe(false);
    });

    it('shows Edit for admin on any active prescription', () => {
      expect(canEditPrescription(UserRole.ADMIN, activeOwn, 'admin-1')).toBe(true);
    });

    it('hides patient edit and delete for pharmacy', () => {
      expect(canMutatePatientRecord(UserRole.PHARMACY)).toBe(false);
      expect(canMutatePatientRecord(UserRole.ADMIN)).toBe(true);
      expect(canMutatePatientRecord(UserRole.RECEPTIONIST)).toBe(true);
      expect(canMutatePatientRecord(UserRole.DOCTOR)).toBe(true);
    });

    it('sends pharmacy pending and dispense actions to prescriptions, stock alert to medicines', () => {
      const actions = getRoleQuickActions(UserRole.PHARMACY);
      expect(actions.find((action) => action.action === 'pendingPrescriptions')?.module).toBe('prescriptions');
      expect(actions.find((action) => action.action === 'dispenseMedicine')?.module).toBe('prescriptions');
      expect(actions.find((action) => action.action === 'stockAlert')?.module).toBe('medicines');
    });

    it('hides Edit for receptionist, pharmacy, and other roles', () => {
      expect(canEditPrescription(UserRole.RECEPTIONIST, activeOwn, 'r1')).toBe(false);
      expect(canEditPrescription(UserRole.PHARMACY, activeOwn, 'p1')).toBe(false);
      expect(canEditPrescription(UserRole.NURSE, activeOwn, 'n1')).toBe(false);
    });

    it('hides Edit for dispensed or cancelled prescriptions', () => {
      expect(canEditPrescription(UserRole.DOCTOR, { status: 'DISPENSED', doctorId: 'doc-1' }, 'doc-1')).toBe(false);
      expect(canEditPrescription(UserRole.ADMIN, { status: 'CANCELLED', doctorId: 'doc-1' }, 'admin-1')).toBe(false);
    });
  });

  describe('roleUsesConsultationFee', () => {
    it('should be true for doctors and admins', () => {
      expect(roleUsesConsultationFee(UserRole.DOCTOR)).toBe(true);
      expect(roleUsesConsultationFee(UserRole.ADMIN)).toBe(true);
    });

    it('should be false for other roles', () => {
      expect(roleUsesConsultationFee(UserRole.RECEPTIONIST)).toBe(false);
      expect(roleUsesConsultationFee(UserRole.PHARMACY)).toBe(false);
      expect(roleUsesConsultationFee(UserRole.NURSE)).toBe(false);
    });
  });

  describe('getRoleDisplayInfo', () => {
    it('should return correct info for ADMIN', () => {
      const info = getRoleDisplayInfo(UserRole.ADMIN);
      expect(info.label).toBe('Administrator');
      expect(info.icon).toBe('👨‍💼');
    });

    it('should return correct info for DOCTOR', () => {
      const info = getRoleDisplayInfo(UserRole.DOCTOR);
      expect(info.label).toBe('Doctor');
      expect(info.icon).toBe('👨‍⚕️');
    });

    it('should return fallback info for unknown role', () => {
      const info = getRoleDisplayInfo('UNKNOWN_ROLE' as UserRole);
      expect(info.label).toBe('UNKNOWN_ROLE');
      expect(info.icon).toBe('👤');
    });
  });

  describe('Lab technician dashboard', () => {
    it('should include patients in lab tech quick actions', () => {
      const actions = getRoleQuickActions(UserRole.LAB_TECH);
      expect(actions.map((action) => action.module)).toEqual(
        expect.arrayContaining(['labTests', 'patients', 'configuration'])
      );
      expect(actions.some((action) => action.name === 'Patients')).toBe(true);
      expect(actions.some((action) => action.action === 'appUpdates')).toBe(true);
    });

    it('should send receptionist register and book actions to OPD Flow', () => {
      const actions = getRoleQuickActions(UserRole.RECEPTIONIST);
      expect(actions.find((action) => action.name === 'Register Patient')?.module).toBe('opdFlow');
      expect(actions.find((action) => action.name === 'Book Appointment')?.module).toBe('opdFlow');
    });

    it('sends doctor pending consultations and prescription work to the OPD queue', () => {
      const actions = getRoleQuickActions(UserRole.DOCTOR);
      expect(actions.find((action) => action.name === 'Pending Consultations')).toMatchObject({
        action: 'consultQueue',
        module: 'opdFlow',
      });
      expect(actions.find((action) => action.name === 'Write Prescription')).toMatchObject({
        action: 'consultQueue',
        module: 'opdFlow',
      });
    });

    it('hides available modules for lab technicians except via quick actions', () => {
      expect(shouldShowAvailableModules(UserRole.LAB_TECH)).toBe(false);
      expect(shouldShowAvailableModules(UserRole.ADMIN)).toBe(true);
      expect(shouldShowAvailableModules(UserRole.DOCTOR)).toBe(true);
    });

    it('gives every role access to configuration for app updates', () => {
      const roles = [
        UserRole.ADMIN,
        UserRole.DOCTOR,
        UserRole.RECEPTIONIST,
        UserRole.LAB_TECH,
        UserRole.PHARMACY,
        UserRole.NURSE,
        UserRole.WARD_MANAGER,
        UserRole.NURSING_SUPERVISOR,
      ];
      roles.forEach((role) => {
        expect(hasModuleAccess(role, 'configuration')).toBe(true);
        expect(getRoleQuickActions(role).some((action) => action.action === 'appUpdates')).toBe(true);
      });
    });
  });

  describe('IPD Sub-Module Permissions', () => {
    describe('hasIPDSubModuleAccess', () => {
      it('should return true for ADMIN accessing all IPD sub-modules', () => {
        expect(hasIPDSubModuleAccess(UserRole.ADMIN, 'dashboard')).toBe(true);
        expect(hasIPDSubModuleAccess(UserRole.ADMIN, 'wards')).toBe(true);
        expect(hasIPDSubModuleAccess(UserRole.ADMIN, 'beds')).toBe(true);
        expect(hasIPDSubModuleAccess(UserRole.ADMIN, 'admissions')).toBe(true);
      });

      it('should return true for DOCTOR accessing patientCare', () => {
        expect(hasIPDSubModuleAccess(UserRole.DOCTOR, 'patientCare')).toBe(true);
        expect(hasIPDSubModuleAccess(UserRole.DOCTOR, 'discharge')).toBe(true);
      });

      it('should return false for DOCTOR accessing restricted sub-modules', () => {
        expect(hasIPDSubModuleAccess(UserRole.DOCTOR, 'wards')).toBe(false);
        expect(hasIPDSubModuleAccess(UserRole.DOCTOR, 'beds')).toBe(false);
      });

      it('should return false for unknown role', () => {
        expect(hasIPDSubModuleAccess('UNKNOWN_ROLE' as UserRole, 'dashboard')).toBe(false);
      });
    });

    describe('getAvailableIPDSubModules', () => {
      it('should return all sub-modules for ADMIN', () => {
        const modules = getAvailableIPDSubModules(UserRole.ADMIN);
        expect(modules).toContain('dashboard');
        expect(modules).toContain('wards');
        expect(modules).toContain('beds');
        expect(modules.length).toBeGreaterThan(5);
      });

      it('should return limited sub-modules for DOCTOR', () => {
        const modules = getAvailableIPDSubModules(UserRole.DOCTOR);
        expect(modules).toContain('dashboard');
        expect(modules).toContain('patientCare');
        expect(modules).toContain('discharge');
        expect(modules).not.toContain('wards');
      });

      it('should return empty array for unknown role', () => {
        const modules = getAvailableIPDSubModules('UNKNOWN_ROLE' as UserRole);
        expect(modules).toEqual([]);
      });
    });
  });
});

