import { Router, Response } from 'express';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import { UserRole } from '@prisma/client';
import {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  searchPatientByPhone,
  getPatientStats,
} from '../controllers/patientController';

const router = Router();

// Custom middleware to allow all roles that have patient module access
// Based on rolePermissions: ADMIN, DOCTOR, RECEPTIONIST, PHARMACY, LAB_TECH, NURSE, WARD_MANAGER, NURSING_SUPERVISOR
const requirePatientAccess = (req: AuthRequest, res: Response, next: any) => {
  const userRole = req.user?.role;
  const allowedRoles: UserRole[] = [
    UserRole.ADMIN,
    UserRole.SUBADMIN,
    UserRole.DOCTOR,
    UserRole.RECEPTIONIST,
    UserRole.PHARMACY,
    UserRole.LAB_TECH,
    UserRole.NURSE,
    UserRole.WARD_MANAGER,
    UserRole.NURSING_SUPERVISOR
  ];
  
  if (allowedRoles.includes(userRole)) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
  }
};

/** Create patient: admin or receptionist (OPD registration). */
const requirePatientCreateAccess = (req: AuthRequest, res: Response, next: any) => {
  const userRole = req.user?.role;
  if (
    userRole === UserRole.ADMIN ||
    userRole === UserRole.SUBADMIN ||
    userRole === UserRole.RECEPTIONIST
  ) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied. Only administrators and receptionists can create patients.',
    });
  }
};

// Apply authentication middleware to all routes
router.use(authenticateToken);

// @route   GET /api/patients
// @desc    Get all patients with search and pagination
// @access  Private (Admin, Doctor, Receptionist)
router.get('/', requirePatientAccess, getPatients);

// @route   GET /api/patients/search/:phone
// @desc    Search patients by phone number
// @access  Private (Admin, Doctor, Receptionist)
router.get('/search/:phone', requirePatientAccess, searchPatientByPhone);

// @route   GET /api/patients/stats
// @desc    Get patient statistics
// @access  Private (Admin, Doctor, Receptionist)
router.get('/stats', requirePatientAccess, getPatientStats);

// @route   GET /api/patients/:id
// @desc    Get patient by ID
// @access  Private (Admin, Doctor, Receptionist)
router.get('/:id', requirePatientAccess, getPatientById);

// @route   POST /api/patients
// @desc    Create new patient
// @access  Private (Admin, Receptionist)
router.post('/', requirePatientCreateAccess, createPatient);

// @route   PUT /api/patients/:id
// @desc    Update patient
// @access  Private (Admin, Receptionist)
router.put('/:id', requirePatientCreateAccess, updatePatient);

// @route   DELETE /api/patients/:id
// @desc    Delete patient
// @access  Private (Admin only)
router.delete('/:id', requireAdmin, deletePatient);

export { router as patientRoutes };