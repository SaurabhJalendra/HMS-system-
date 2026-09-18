import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '@prisma/client';
import { upload } from '../middleware/upload';
import {
  createLabTest,
  getLabTests,
  getLabTestById,
  updateLabTest,
  uploadLabTestReport,
  getLabTestStats,
  getPendingLabTests,
  getTestCatalog,
  createTestCatalogItem,
  updateTestCatalogItem,
  getScheduledLabTests,
  getLabTestReport,
  getLabTestsByCategory,
  getAvailableTestsForTechnician,
  getTechnicianSelectedTests,
  setTechnicianTestSelections,
  getTechnicianAvailableTests,
  getLabTestCategories,
  downloadLabTestReport,
} from '../controllers/labTestController';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Lab Test Management Routes

// @route   GET /api/lab-tests
// @desc    Get all lab tests with search and pagination
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getLabTests);

// @route   GET /api/lab-tests/stats
// @desc    Get lab test statistics
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/stats', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getLabTestStats);

// @route   GET /api/lab-tests/pending
// @desc    Get pending lab tests for lab technicians
// @access  Private (Admin, Lab Tech)
router.get('/pending', requireRole(UserRole.ADMIN, UserRole.LAB_TECH), getPendingLabTests);

// @route   GET /api/lab-tests/scheduled
// @desc    Get scheduled lab tests for a specific date
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/scheduled', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getScheduledLabTests);

// @route   GET /api/lab-tests/report
// @desc    Get advanced lab test report
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/report', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getLabTestReport);

// @route   GET /api/lab-tests/by-category
// @desc    Get lab tests by category for reporting
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/by-category', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getLabTestsByCategory);

// Test Catalog Management Routes

// @route   GET /api/lab-tests/catalog
// @desc    Get test catalog
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/catalog', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getTestCatalog);

// @route   POST /api/lab-tests/catalog
// @desc    Create new test catalog item
// @access  Private (Admin only)
router.post('/catalog', requireRole(UserRole.ADMIN), createTestCatalogItem);

// @route   PUT /api/lab-tests/catalog/:id
// @desc    Update test catalog item
// @access  Private (Admin only)
router.put('/catalog/:id', requireRole(UserRole.ADMIN), updateTestCatalogItem);

// ========== TECHNICIAN TEST SELECTION ROUTES ==========

// @route   GET /api/lab-tests/technician/available-tests
// @desc    Get available tests for technician selection
// @access  Private (Admin, Lab Tech)
router.get('/technician/available-tests', requireRole(UserRole.ADMIN, UserRole.LAB_TECH), getAvailableTestsForTechnician);

// @route   GET /api/lab-tests/technician/:technicianId/selected-tests
// @desc    Get technician's selected tests
// @access  Private (Admin, Lab Tech)
router.get('/technician/:technicianId/selected-tests', requireRole(UserRole.ADMIN, UserRole.LAB_TECH), getTechnicianSelectedTests);

// @route   POST /api/lab-tests/technician/set-selections
// @desc    Set technician's test selections
// @access  Private (Admin, Lab Tech)
router.post('/technician/set-selections', requireRole(UserRole.ADMIN, UserRole.LAB_TECH), setTechnicianTestSelections);

// @route   GET /api/lab-tests/technician/:technicianId/available-tests
// @desc    Get tests available for a specific technician
// @access  Private (Admin, Lab Tech)
router.get('/technician/:technicianId/available-tests', requireRole(UserRole.ADMIN, UserRole.LAB_TECH), getTechnicianAvailableTests);

// @route   GET /api/lab-tests/categories
// @desc    Get lab test categories for filtering
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/categories', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getLabTestCategories);

// @route   GET /api/lab-tests/:id/report
// @desc    Download a lab report file (authenticated)
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/:id/report', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), downloadLabTestReport);

// @route   GET /api/lab-tests/:id
// @desc    Get lab test by ID
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.get('/:id', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), getLabTestById);

// @route   POST /api/lab-tests
// @desc    Create new lab test order
// @access  Private (Admin, Doctor, Receptionist, Lab Tech)
router.post('/', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_TECH), createLabTest);

// @route   PUT /api/lab-tests/:id
// @desc    Update lab test (status, results, notes)
// @access  Private (Admin, Lab Tech)
router.put('/:id', requireRole(UserRole.ADMIN, UserRole.LAB_TECH), updateLabTest);

// @route   POST /api/lab-tests/:id/upload-report
// @desc    Upload lab test report file (PDF/image) for MRI, CT Scan, X-Ray
// @access  Private (Admin, Lab Tech)
router.post('/:id/upload-report', requireRole(UserRole.ADMIN, UserRole.LAB_TECH), upload.single('reportFile'), uploadLabTestReport);

export { router as labTestRoutes };
