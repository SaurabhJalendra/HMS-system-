import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '@prisma/client';
import {
  createPrescription,
  getPrescriptions,
  getPrescriptionById,
  updatePrescription,
  dispensePrescription,
  cancelPrescription,
  deletePrescription,
  getPrescriptionInventoryAudit,
  getPrescriptionStats,
  getPendingPrescriptions,
  getPrescriptionTemplates,
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
} from '../controllers/prescriptionController';

const router = Router();

// Validate all imported functions are available
if (!getPendingPrescriptions || typeof getPendingPrescriptions !== 'function') {
  throw new Error('getPendingPrescriptions is not properly exported from prescriptionController');
}

if (!getPrescriptionStats || typeof getPrescriptionStats !== 'function') {
  throw new Error('getPrescriptionStats is not properly exported from prescriptionController');
}

// Apply authentication middleware to all routes
router.use(authenticateToken);

// @route   POST /api/prescriptions
// @desc    Create new prescription
// @access  Private (Doctor, Admin)
router.post('/', requireRole(UserRole.DOCTOR, UserRole.ADMIN), createPrescription);

// @route   GET /api/prescriptions
// @desc    Get all prescriptions with search and pagination
// @access  Private (Doctor, Admin, Pharmacy, Receptionist)
router.get('/', requireRole(UserRole.DOCTOR, UserRole.ADMIN, UserRole.PHARMACY, UserRole.RECEPTIONIST), getPrescriptions);

// @route   GET /api/prescriptions/pending
// @desc    Get pending prescriptions
// @access  Private (Pharmacy, Admin)
router.get('/pending', requireRole(UserRole.PHARMACY, UserRole.ADMIN), getPendingPrescriptions);

// @route   GET /api/prescriptions/stats
// @desc    Get prescription statistics
// @access  Private (Admin, Doctor, Pharmacy)
router.get('/stats', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PHARMACY), getPrescriptionStats);

// Doctor-owned reusable templates for the OPD prescription writer
router.get('/templates', requireRole(UserRole.DOCTOR, UserRole.ADMIN), getPrescriptionTemplates);
router.post('/templates', requireRole(UserRole.DOCTOR, UserRole.ADMIN), createPrescriptionTemplate);
router.delete('/templates/:id', requireRole(UserRole.DOCTOR, UserRole.ADMIN), deletePrescriptionTemplate);

// Pharmacy stock check for every line in a prescription
router.get(
  '/:id/inventory-audit',
  requireRole(UserRole.PHARMACY, UserRole.ADMIN),
  getPrescriptionInventoryAudit,
);

// @route   GET /api/prescriptions/:id
// @desc    Get prescription by ID
// @access  Private (Doctor, Admin, Pharmacy, Receptionist)
router.get('/:id', requireRole(UserRole.DOCTOR, UserRole.ADMIN, UserRole.PHARMACY, UserRole.RECEPTIONIST), getPrescriptionById);

// @route   PUT /api/prescriptions/:id
// @desc    Update prescription
// @access  Private (Doctor, Admin)
router.put('/:id', requireRole(UserRole.DOCTOR, UserRole.ADMIN), updatePrescription);

// @route   POST /api/prescriptions/:id/dispense
// @desc    Dispense prescription
// @access  Private (Pharmacy, Admin)
router.post('/:id/dispense', requireRole(UserRole.PHARMACY, UserRole.ADMIN), dispensePrescription);

// @route   POST /api/prescriptions/:id/cancel
// @desc    Cancel prescription
// @access  Private (Doctor, Pharmacy, Admin)
router.post(
  '/:id/cancel',
  requireRole(UserRole.DOCTOR, UserRole.PHARMACY, UserRole.ADMIN),
  cancelPrescription,
);

// @route   DELETE /api/prescriptions/:id
// @desc    Delete prescription (permanently remove from database)
// @access  Private (Admin only)
router.delete('/:id', requireRole(UserRole.ADMIN), deletePrescription);

export { router as prescriptionRoutes };