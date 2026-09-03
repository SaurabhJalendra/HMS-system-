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
      expect(modules).not.toContain('users');
      expect(modules).not.toContain('configuration');
    });

    it('should return appropriate modules for RECEPTIONIST', () => {
      const modules = getAvailableModules(UserRole.RECEPTIONIST);
      expect(modules).toContain('dashboard');
      expect(modules).toContain('patients');
      expect(modules).toContain('appointments');
      expect(modules).toContain('billing');
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
      expect(hasModuleAccess(UserRole.DOCTOR, 'configuration')).toBe(false);
    });

    it('should return true for DOCTOR accessing allowed modules', () => {
      expect(hasModuleAccess(UserRole.DOCTOR, 'patients')).toBe(true);
      expect(hasModuleAccess(UserRole.DOCTOR, 'consultations')).toBe(true);
      expect(hasModuleAccess(UserRole.DOCTOR, 'prescriptions')).toBe(true);
    });

    it('should return false for unknown role', () => {
      expect(hasModuleAccess('UNKNOWN_ROLE' as UserRole, 'dashboard')).toBe(false);
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

