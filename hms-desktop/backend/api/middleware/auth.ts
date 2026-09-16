import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { createError } from './errorHandler';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
    fullName: string;
  };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw createError('Access token required', 401);
    }

    // Handle mock token for development
    if (token === 'mock-admin-token') {
      // Get admin user from database
      const adminUser = await prisma.user.findUnique({
        where: { username: 'admin' },
        select: {
          id: true,
          username: true,
          role: true,
          fullName: true,
          isActive: true,
        },
      });

      if (!adminUser || !adminUser.isActive) {
        throw createError('Admin user not found or inactive', 401);
      }

      req.user = {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        fullName: adminUser.fullName,
      };

      return next();
    }

    const jwtSecret = process.env['JWT_SECRET'];
    if (!jwtSecret) {
      throw createError('JWT secret not configured', 500);
    }
    
    // Verify JWT token with better error handling
    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret, {
        issuer: 'hms-backend',
        audience: 'hms-desktop',
      });
      
      // Verify token type
      if (decoded.type && decoded.type !== 'access') {
        return next(createError('Invalid token type', 401));
      }
    } catch (jwtError: any) {
      // Handle specific JWT errors more gracefully
      if (jwtError instanceof jwt.TokenExpiredError) {
        return next(createError('Token expired', 401));
      } else if (jwtError instanceof jwt.JsonWebTokenError) {
        return next(createError('Invalid token', 401));
      } else {
        return next(createError('Token verification failed', 401));
      }
    }
    
    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        role: true,
        fullName: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return next(createError('User not found or inactive', 401));
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
    };

    next();
  } catch (error: any) {
    // If it's already an AppError with statusCode, pass it through
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return next(error);
    }
    
    // Handle unexpected errors
    if (error instanceof jwt.JsonWebTokenError) {
      return next(createError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      return next(createError('Token expired', 401));
    } else {
      // For other unexpected errors, log and return generic auth error
      console.error('Unexpected auth error:', error);
      return next(createError('Authentication failed', 401));
    }
  }
};

/**
 * SUBADMIN is a deputy administrator. It inherits every ADMIN grant, so any
 * route that allows ADMIN also allows SUBADMIN without listing it.
 *
 * The two things it must never reach are guarded separately:
 * hospital configuration (`requireAdminOnly`) and administrator accounts
 * (`assertCanManageTargetUser` in the user controller).
 */
export const ADMIN_LEVEL_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUBADMIN];

export const isAdminLevel = (userRole: UserRole): boolean =>
  ADMIN_LEVEL_ROLES.includes(userRole);

// Export requireRole as a function declaration (better for CommonJS compatibility)
export function requireRole(...roles: UserRole[]) {
  const allowed =
    roles.includes(UserRole.ADMIN) && !roles.includes(UserRole.SUBADMIN)
      ? [...roles, UserRole.SUBADMIN]
      : roles;

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError('Authentication required', 401));
    }

    if (!allowed.includes(req.user.role)) {
      return next(createError('Insufficient permissions', 403));
    }

    next();
  };
}

/** Strictly ADMIN. Use for hospital configuration and administrator accounts. */
export const requireAdminOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(createError('Authentication required', 401));
  }
  if (req.user.role !== UserRole.ADMIN) {
    return next(
      createError('Only an administrator can perform this action', 403)
    );
  }
  next();
};

/** Allows ADMIN and SUBADMIN. */
export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireDoctor = requireRole(UserRole.DOCTOR);
export const requireLabTech = requireRole(UserRole.LAB_TECH);
export const requirePharmacy = requireRole(UserRole.PHARMACY);
export const requireReceptionist = requireRole(UserRole.RECEPTIONIST);
export const requireNurse = requireRole(UserRole.NURSE);
export const requireWardManager = requireRole(UserRole.WARD_MANAGER);
export const requireNursingSupervisor = requireRole(UserRole.NURSING_SUPERVISOR);

// Combined role helpers for common IPD/clinical use cases
export const requireNursingStaff = requireRole(
  UserRole.NURSE,
  UserRole.NURSING_SUPERVISOR,
  UserRole.WARD_MANAGER
);
export const requireClinicalStaff = requireRole(
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.NURSING_SUPERVISOR,
  UserRole.WARD_MANAGER
);

// Role-based access control helpers
export const canAccessPatientData = (userRole: UserRole): boolean => {
  return [
    UserRole.ADMIN,
    UserRole.SUBADMIN,
    UserRole.DOCTOR,
    UserRole.LAB_TECH,
    UserRole.PHARMACY,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
    UserRole.WARD_MANAGER,
    UserRole.NURSING_SUPERVISOR,
  ].includes(userRole);
};

export const canAccessFinancialData = (userRole: UserRole): boolean => {
  const allowed: UserRole[] = [
    UserRole.ADMIN,
    UserRole.SUBADMIN,
    UserRole.RECEPTIONIST,
  ];
  return allowed.includes(userRole);
};

export const canManageUsers = (userRole: UserRole): boolean => {
  return isAdminLevel(userRole);
};

/** Hospital configuration stays with the administrator only. */
export const canManageSystem = (userRole: UserRole): boolean => {
  return userRole === UserRole.ADMIN;
};

export const canManageIPD = (userRole: UserRole): boolean => {
  const allowed: UserRole[] = [
    UserRole.ADMIN,
    UserRole.SUBADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.WARD_MANAGER,
    UserRole.NURSING_SUPERVISOR,
  ];
  return allowed.includes(userRole);
};

export const canManageOT = (userRole: UserRole): boolean => {
  const allowed: UserRole[] = [
    UserRole.ADMIN,
    UserRole.SUBADMIN,
    UserRole.DOCTOR,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
    UserRole.NURSING_SUPERVISOR,
    UserRole.WARD_MANAGER,
  ];
  return allowed.includes(userRole);
};
