import { PrismaClient, UserRole } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { isAdminLevel } from '../middleware/auth';

export const LAB_TYPES = ['General', 'MRI', 'CT Scan', 'X-Ray', 'Ultrasound', 'Pathology'] as const;
export type LabType = (typeof LAB_TYPES)[number];

export const mapCategoryToLabType = (category?: string | null): LabType => {
  if (!category) return 'General';
  const categoryUpper = category.toUpperCase();
  if (categoryUpper === 'MRI') return 'MRI';
  if (categoryUpper === 'CT SCAN' || categoryUpper === 'CT') return 'CT Scan';
  if (categoryUpper === 'X-RAY' || categoryUpper === 'XRAY') return 'X-Ray';
  if (categoryUpper === 'ULTRASOUND' || categoryUpper === 'USG') return 'Ultrasound';
  if (categoryUpper === 'PATHOLOGY') return 'Pathology';
  return 'General';
};

export const isAllLabType = (labType?: string | null): boolean =>
  !!labType && ['ALL', 'ALL TESTS'].includes(labType.trim().toUpperCase());

export const capLimit = (limit: number | undefined, fallback = 20, max = 100): number => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
};

export const assertLabModuleEnabled = async (prisma: PrismaClient) => {
  const config = await prisma.hospitalConfig.findFirst({
    select: { labTestsEnabled: true },
  });
  if (config && config.labTestsEnabled === false) {
    const error = new Error('Lab tests are disabled in hospital configuration');
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
};

export const assertCategoryEnabled = async (
  prisma: PrismaClient,
  category?: string | null
) => {
  if (!category) return;
  const categoryConfig = await prisma.labTestConfig.findFirst({
    where: { testCategory: category },
    select: { categoryEnabled: true },
  });
  if (categoryConfig && categoryConfig.categoryEnabled === false) {
    const error = new Error(`Lab category "${category}" is disabled`);
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
};

export const getTechnicianAssignedIds = async (
  prisma: PrismaClient,
  technicianId: string
): Promise<string[]> => {
  const selections = await prisma.technicianTestSelection.findMany({
    where: { technicianId },
    select: { testCatalogId: true },
  });
  return selections.map((selection) => selection.testCatalogId);
};

export const applyLabListScope = async (
  prisma: PrismaClient,
  req: AuthRequest,
  where: Record<string, unknown>
) => {
  const role = req.user?.role;
  if (!role || isAdminLevel(role) || role === UserRole.RECEPTIONIST) {
    return where;
  }

  if (role === UserRole.DOCTOR) {
    return { ...where, orderedBy: req.user!.id };
  }

  if (role === UserRole.LAB_TECH) {
    const assignedIds = await getTechnicianAssignedIds(prisma, req.user!.id);
    return {
      ...where,
      testCatalogId: { in: assignedIds.length > 0 ? assignedIds : ['__none__'] },
    };
  }

  return where;
};

export const canAccessLabTestRecord = async (
  prisma: PrismaClient,
  req: AuthRequest,
  labTest: { orderedBy: string; testCatalogId: string }
): Promise<boolean> => {
  const role = req.user?.role;
  if (!role || !req.user) return false;
  if (isAdminLevel(role) || role === UserRole.RECEPTIONIST) return true;
  if (role === UserRole.DOCTOR) return labTest.orderedBy === req.user.id;
  if (role === UserRole.LAB_TECH) {
    const assignedIds = await getTechnicianAssignedIds(prisma, req.user.id);
    return assignedIds.includes(labTest.testCatalogId);
  }
  return false;
};

export const assertOwnTechnicianId = (req: AuthRequest, technicianId: string) => {
  if (!req.user) {
    const error = new Error('Authentication required');
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  if (req.user.role === UserRole.LAB_TECH && req.user.id !== technicianId) {
    const error = new Error('Lab technicians can only manage their own test selections');
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
};
