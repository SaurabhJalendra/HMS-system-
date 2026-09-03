import { Response } from 'express';
import { logAudit } from '../utils/auditLogger';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth';
import { roleStoresConsultationFee } from '../utils/hospitalHelper';

const prisma = new PrismaClient();

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  email: true,
  phone: true,
  consultationFee: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const consultationFeeInput = z.union([z.number(), z.string(), z.null()]).optional();

function parseConsultationFee(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return 'invalid';
  }
  return n;
}

function feeRequiredError() {
  return {
    success: false as const,
    message: 'Consultation fee is required for doctors',
  };
}

function feeInvalidError() {
  return {
    success: false as const,
    message: 'Consultation fee must be a number greater than or equal to 0',
  };
}

// Validation schemas
const userCreateSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username too long'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required').max(100, 'Full name too long'),
  role: z.nativeEnum(UserRole, { message: 'Invalid role' }),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().min(10, 'Phone number too short').max(15, 'Phone number too long').optional(),
  department: z.string().max(100, 'Department name too long').optional(),
  consultationFee: consultationFeeInput,
});

const userUpdateSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username too long').optional(),
  fullName: z.string().min(1, 'Full name is required').max(100, 'Full name too long').optional(),
  role: z.nativeEnum(UserRole, { message: 'Invalid role' }).optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().min(10, 'Phone number too short').max(15, 'Phone number too long').optional(),
  department: z.string().max(100, 'Department name too long').optional(),
  isActive: z.boolean().optional(),
  consultationFee: consultationFeeInput,
});

const userSearchSchema = z.object({
  search: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.string().transform(val => val === 'true' ? true : val === 'false' ? false : undefined).optional(),
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => parseInt(val) || 20).optional(),
});

const passwordResetSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

// Create new user
export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = userCreateSchema.parse(req.body);

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: validatedData.username },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists',
      });
    }

    const parsedFee = parseConsultationFee(validatedData.consultationFee);
    if (parsedFee === 'invalid') {
      return res.status(400).json(feeInvalidError());
    }
    if (validatedData.role === UserRole.DOCTOR && parsedFee === null) {
      return res.status(400).json(feeRequiredError());
    }
    const consultationFee = roleStoresConsultationFee(validatedData.role) ? parsedFee : null;

    // Hash password
    const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12');
    const passwordHash = await bcrypt.hash(validatedData.password, saltRounds);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        username: validatedData.username,
        passwordHash,
        fullName: validatedData.fullName,
        role: validatedData.role,
        email: validatedData.email || null,
        phone: validatedData.phone || null,
        consultationFee,
        isActive: true,
      },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_USER',
      tableName: 'users',
      recordId: newUser.id,
      newValue: {
        username: newUser.username,
        fullName: newUser.fullName,
        role: newUser.role,
        consultationFee: newUser.consultationFee,
      },
    });

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user: userWithoutPassword },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all users with search and pagination
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { search, role, isActive, page = 1, limit = 20 } = userSearchSchema.parse(req.query);
    
    const skip = (page - 1) * limit;
    
    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (role) {
      where.role = role;
    }
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: USER_PUBLIC_SELECT,
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get user by ID
export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update user
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = userUpdateSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent admin from deactivating themselves
    if (id === req.user!.id && validatedData.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account',
      });
    }

    // Check if username is being changed and if it already exists
    if (validatedData.username && validatedData.username !== existingUser.username) {
      const duplicateUser = await prisma.user.findUnique({
        where: { username: validatedData.username },
      });

      if (duplicateUser) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists',
        });
      }
    }

    const effectiveRole = validatedData.role ?? existingUser.role;
    const becomingDoctor =
      validatedData.role === UserRole.DOCTOR && existingUser.role !== UserRole.DOCTOR;

    let consultationFee: number | null | undefined = undefined;
    if (validatedData.consultationFee !== undefined) {
      const parsedFee = parseConsultationFee(validatedData.consultationFee);
      if (parsedFee === 'invalid') {
        return res.status(400).json(feeInvalidError());
      }
      consultationFee = roleStoresConsultationFee(effectiveRole) ? parsedFee : null;
    } else if (validatedData.role && !roleStoresConsultationFee(effectiveRole)) {
      consultationFee = null;
    }

    if (becomingDoctor && (consultationFee === undefined || consultationFee === null)) {
      return res.status(400).json(feeRequiredError());
    }

    const updateData: {
      username?: string;
      fullName?: string;
      role?: UserRole;
      email?: string | null;
      phone?: string | null;
      isActive?: boolean;
      consultationFee?: number | null;
    } = {};
    if (validatedData.username !== undefined) updateData.username = validatedData.username;
    if (validatedData.fullName !== undefined) updateData.fullName = validatedData.fullName;
    if (validatedData.role !== undefined) updateData.role = validatedData.role;
    if (validatedData.email !== undefined) updateData.email = validatedData.email;
    if (validatedData.phone !== undefined) updateData.phone = validatedData.phone;
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive;
    if (consultationFee !== undefined) updateData.consultationFee = consultationFee;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: USER_PUBLIC_SELECT,
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_USER',
      tableName: 'users',
      recordId: id,
      oldValue: {
        username: existingUser.username,
        fullName: existingUser.fullName,
        role: existingUser.role,
        isActive: existingUser.isActive,
        consultationFee: existingUser.consultationFee,
      },
      newValue: {
        username: updatedUser.username,
        fullName: updatedUser.fullName,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        consultationFee: updatedUser.consultationFee,
      },
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete user
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent admin from deleting themselves
    if (id === req.user!.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    // Check if user has related records
    const [appointments, consultations, prescriptions, auditLogs] = await Promise.all([
      prisma.appointment.count({ where: { doctorId: id } }),
      prisma.consultation.count({ where: { doctorId: id } }),
      prisma.prescription.count({ where: { doctorId: id } }),
      prisma.auditLog.count({ where: { userId: id } }),
    ]);

    const hasRelatedRecords = appointments > 0 || consultations > 0 || prescriptions > 0;

    if (hasRelatedRecords) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user with existing medical records. Consider deactivating instead.',
        data: {
          appointments,
          consultations,
          prescriptions,
          auditLogs,
        },
      });
    }

    // Delete audit logs that reference this user first (to avoid foreign key constraints)
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: id },
          { recordId: id }
        ]
      }
    });

    // Delete user after cleaning audit logs
    await prisma.user.delete({
      where: { id },
    });

    // Log the action after deleting the user (with system user to avoid foreign key issues)
    try {
      // Get system user or use a default user ID for audit logs
      const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      await logAudit({
        userId: systemUser?.id || req.user!.id,
        action: 'DELETE_USER',
        tableName: 'users',
        recordId: id,
        oldValue: {
          username: existingUser.username,
          fullName: existingUser.fullName,
          role: existingUser.role,
          deletedBy: req.user!.id, // Store who deleted the user in oldValue
        },
      });
    } catch (auditError) {
      console.warn('Failed to create audit log for user deletion:', auditError);
      // Don't fail the deletion if audit log creation fails
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Reset user password
export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = passwordResetSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Hash new password
    const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12');
    const passwordHash = await bcrypt.hash(validatedData.newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: 'RESET_PASSWORD',
      tableName: 'users',
      recordId: id,
      newValue: { passwordReset: true },
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.issues,
      });
    }
    
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Toggle user active status
export const toggleUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent admin from deactivating themselves
    if (id === req.user!.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own account status',
      });
    }

    // Toggle status
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: !existingUser.isActive },
      select: USER_PUBLIC_SELECT,
    });

    // Log the action
    await logAudit({
      userId: req.user!.id,
      action: updatedUser.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      tableName: 'users',
      recordId: id,
      oldValue: { isActive: existingUser.isActive },
      newValue: { isActive: updatedUser.isActive },
    });

    res.json({
      success: true,
      message: `User ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get user statistics
export const getUserStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers,
      usersByRole,
      activeUsers,
      inactiveUsers,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        usersByRole,
        activeUsers,
        inactiveUsers,
        recentUsers,
      },
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// @desc    Change current user's password
// @route   POST /api/users/change-password
// @access  Private (Any authenticated user)
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
