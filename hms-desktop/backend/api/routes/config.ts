import { Router, Response, NextFunction } from 'express';
import { checkSetupStatus, getHospitalConfig, updateHospitalConfig, getLabTestConfig, addLabTestConfig, updateLabTestConfig, getMedicineConfig, addMedicineConfig, updateMedicineConfig, uploadHospitalLogo } from '../controllers/configController';
import { authenticateToken, requireAdminOnly, AuthRequest } from '../middleware/auth';
import { getHospitalId } from '../utils/hospitalHelper';
import { uploadLogo } from '../middleware/upload';

const router = Router();

/**
 * The first-run setup wizard writes the hospital before anyone can log in, so
 * this route has to stay open until a hospital exists. After that it is
 * administrator-only, which is what keeps SUBADMIN out of configuration.
 */
const allowSetupOtherwiseAdminOnly = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const configured = await getHospitalId();
  if (!configured) return next();

  authenticateToken(req, res, (err?: unknown) => {
    if (err) return next(err);
    requireAdminOnly(req, res, next);
  });
};

// Setup status check (no auth required)
router.get('/setup-status', checkSetupStatus);

// Hospital Configuration - readable by any signed-in role, writable by admin only
router.get('/hospital', getHospitalConfig);
router.put('/hospital', allowSetupOtherwiseAdminOnly, updateHospitalConfig);
router.post(
  '/hospital/logo',
  allowSetupOtherwiseAdminOnly,
  uploadLogo.single('logo'),
  uploadHospitalLogo
);

// Configuration belongs to the administrator alone — SUBADMIN is excluded here
router.use(authenticateToken);
router.use(requireAdminOnly);

// Lab Test Configuration
router.get('/lab-tests', getLabTestConfig);
router.post('/lab-tests', addLabTestConfig);
router.put('/lab-tests/:id', updateLabTestConfig);

// Medicine Configuration
router.get('/medicines', getMedicineConfig);
router.post('/medicines', addMedicineConfig);
router.put('/medicines/:id', updateMedicineConfig);

export default router;
