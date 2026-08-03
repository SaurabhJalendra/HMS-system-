import { Router } from "express";
import { getVersionInfo } from "../controllers/versionController";

const router = Router();

/** Public — no auth required (called before/during login for compatibility) */
router.get("/", getVersionInfo);

export default router;
