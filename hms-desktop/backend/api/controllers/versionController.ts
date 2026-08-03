import { Request, Response } from "express";
import { getReleaseManifest } from "../utils/releaseManifest";

/**
 * Public version endpoint for desktop ↔ backend compatibility checks.
 * GET /api/version
 */
export function getVersionInfo(req: Request, res: Response): void {
  const manifest = getReleaseManifest();

  res.status(200).json({
    success: true,
    data: {
      backendVersion: manifest.backendVersion,
      minimumDesktopVersion: manifest.minimumDesktopVersion,
      latestDesktopVersion: manifest.latestDesktopVersion,
      releaseNotes: manifest.releaseNotes,
      publishedAt: manifest.publishedAt,
      serverTime: new Date().toISOString(),
    },
  });
}
