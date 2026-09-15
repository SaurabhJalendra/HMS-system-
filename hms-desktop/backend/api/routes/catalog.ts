import { Router } from 'express';
import { 
  getAllAllergies, 
  addAllergy, 
  getAllChronicConditions, 
  addChronicCondition,
  getAllDiagnoses,
  addDiagnosis,
  getAllMedicines,
  addMedicine,
  updateMedicineStock,
  getPatientAllergies,
  addPatientAllergy,
  deletePatientAllergy,
  getPatientChronicConditions,
  addPatientChronicCondition,
  deletePatientChronicCondition
} from '../controllers/catalogController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// All catalog routes require authentication
router.use(authenticateToken);

// ========== ALLERGY CATALOG ==========
router.get('/allergies', getAllAllergies);
router.post('/allergies', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), addAllergy);

// ========== CHRONIC CONDITION CATALOG ==========
router.get('/chronic-conditions', getAllChronicConditions);
router.post('/chronic-conditions', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), addChronicCondition);

// ========== DIAGNOSIS CATALOG ==========
router.get('/diagnoses', getAllDiagnoses);
router.post('/diagnoses', requireRole(UserRole.ADMIN, UserRole.DOCTOR), addDiagnosis);

// ========== MEDICINE CATALOG ==========
router.get('/medicines', getAllMedicines);
router.post('/medicines', requireRole(UserRole.ADMIN, UserRole.PHARMACY), addMedicine);
router.put('/medicines/:id/stock', requireRole(UserRole.ADMIN, UserRole.PHARMACY), updateMedicineStock);

// ========== PATIENT ALLERGIES ==========
router.get('/patients/:patientId/allergies', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), getPatientAllergies);
router.post('/patients/:patientId/allergies', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), addPatientAllergy);
router.delete('/patients/:patientId/allergies/:id', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), deletePatientAllergy);

// ========== PATIENT CHRONIC CONDITIONS ==========
router.get('/patients/:patientId/chronic-conditions', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), getPatientChronicConditions);
router.post('/patients/:patientId/chronic-conditions', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), addPatientChronicCondition);
router.delete('/patients/:patientId/chronic-conditions/:id', requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST), deletePatientChronicCondition);

export default router;

