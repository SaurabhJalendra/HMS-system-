import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '@prisma/client';
import {
  createConsultation,
  getConsultations,
  getConsultationById,
  updateConsultation,
  deleteConsultation,
  getConsultationStats,
} from '../controllers/consultationController';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// @route   GET /api/consultations
// @desc    Get all consultations with search and pagination
// @access  Private (Admin, Sub-admin, Doctor, Receptionist — receptionist needs read access for billing)
router.get('/', requireRole(UserRole.ADMIN, UserRole.SUBADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), getConsultations);

// @route   GET /api/consultations/stats
// @desc    Get consultation statistics
// @access  Private (Admin, Sub-admin, Doctor)
router.get('/stats', requireRole(UserRole.ADMIN, UserRole.SUBADMIN, UserRole.DOCTOR), getConsultationStats);

// @route   GET /api/consultations/:id
// @desc    Get consultation by ID
// @access  Private (Admin, Sub-admin, Doctor, Receptionist)
router.get('/:id', requireRole(UserRole.ADMIN, UserRole.SUBADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), getConsultationById);

// @route   POST /api/consultations
// @desc    Create new consultation
// @access  Private (Admin, Sub-admin, Doctor)
router.post('/', requireRole(UserRole.ADMIN, UserRole.SUBADMIN, UserRole.DOCTOR), createConsultation);

// @route   PUT /api/consultations/:id
// @desc    Update consultation
// @access  Private (Admin, Sub-admin, Doctor)
router.put('/:id', requireRole(UserRole.ADMIN, UserRole.SUBADMIN, UserRole.DOCTOR), updateConsultation);

// @route   DELETE /api/consultations/:id
// @desc    Delete consultation
// @access  Private (Admin, Sub-admin, Doctor)
router.delete('/:id', requireRole(UserRole.ADMIN, UserRole.SUBADMIN, UserRole.DOCTOR), deleteConsultation);

export { router as consultationRoutes };
