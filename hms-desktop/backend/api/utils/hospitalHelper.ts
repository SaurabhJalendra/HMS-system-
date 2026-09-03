import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get the hospital ID from the database
 * Returns the first hospital config ID or null if none exists
 * 
 * Note: Currently single-tenant - uses HospitalConfig table
 * For multi-tenancy, this should be retrieved from user context
 */
export async function getHospitalId(): Promise<string | null> {
  try {
    // Fixed: Use HospitalConfig table instead of non-existent "hospitals" table
    const hospitalConfig = await prisma.hospitalConfig.findFirst({
      select: { id: true }
    });
    
    if (hospitalConfig) {
      return hospitalConfig.id;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting hospital ID:', error);
    return null;
  }
}

/**
 * Get hospital ID with fallback - throws error if not found
 */
export async function getRequiredHospitalId(): Promise<string> {
  const hospitalId = await getHospitalId();
  if (!hospitalId) {
    throw new Error('No hospital configuration found in database. Please configure hospital settings first.');
  }
  return hospitalId;
}

/**
 * Get full hospital configuration
 * Returns the hospital config with all details
 */
export async function getHospitalConfig() {
  try {
    const hospitalConfig = await prisma.hospitalConfig.findFirst();
    return hospitalConfig;
  } catch (error) {
    console.error('Error getting hospital config:', error);
    return null;
  }
}

/** Doctors and admins who also take OPD can have a personal consultation fee. */
export function roleStoresConsultationFee(role: UserRole): boolean {
  return role === UserRole.DOCTOR || role === UserRole.ADMIN;
}

/**
 * Snapshot fee for a new consultation: clinician personal fee, else hospital default, else 0.
 * A stored 0 on the user is a real fee (free consult) — do not fall back.
 */
export async function resolveConsultationFee(doctorFee: unknown): Promise<number> {
  if (doctorFee != null && doctorFee !== '') {
    const n = Number(doctorFee);
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }

  const hospitalConfig = await getHospitalConfig();
  const fallback = hospitalConfig?.defaultConsultationFee;
  if (fallback != null && String(fallback) !== '') {
    const n = Number(fallback);
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }

  return 0;
}

