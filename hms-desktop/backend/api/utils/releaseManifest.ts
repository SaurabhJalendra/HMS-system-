import fs from "node:fs";
import path from "node:path";

export type ReleaseManifest = {
  version: string;
  backendVersion: string;
  minimumDesktopVersion: string;
  latestDesktopVersion: string;
  releaseNotes: string[];
  publishedAt: string | null;
};

const DEFAULT_MANIFEST: ReleaseManifest = {
  version: "1.0.0",
  backendVersion: "1.0.0",
  minimumDesktopVersion: "1.0.0",
  latestDesktopVersion: "1.0.0",
  releaseNotes: [],
  publishedAt: null,
};

function readJsonFile(filePath: string): Partial<ReleaseManifest> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<ReleaseManifest>;
  } catch {
    return null;
  }
}

function parseReleaseNotes(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
  } catch {
    /* fall through */
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

let cached: ReleaseManifest | null = null;

/**
 * Load release metadata from env (CI) or bundled release-version.json (deploy).
 */
export function getReleaseManifest(): ReleaseManifest {
  if (cached) return cached;

  const fromFile =
    readJsonFile(path.join(__dirname, "../data/release-version.json")) ||
    readJsonFile(path.join(process.cwd(), "api/data/release-version.json")) ||
    readJsonFile(path.join(process.cwd(), "release-version.json"));

  const envNotes = parseReleaseNotes(process.env.RELEASE_NOTES);

  cached = {
    version:
      process.env.APP_VERSION ||
      fromFile?.version ||
      DEFAULT_MANIFEST.version,
    backendVersion:
      process.env.BACKEND_VERSION ||
      fromFile?.backendVersion ||
      process.env.APP_VERSION ||
      DEFAULT_MANIFEST.backendVersion,
    minimumDesktopVersion:
      process.env.MINIMUM_DESKTOP_VERSION ||
      fromFile?.minimumDesktopVersion ||
      DEFAULT_MANIFEST.minimumDesktopVersion,
    latestDesktopVersion:
      process.env.LATEST_DESKTOP_VERSION ||
      fromFile?.latestDesktopVersion ||
      fromFile?.version ||
      DEFAULT_MANIFEST.latestDesktopVersion,
    releaseNotes:
      envNotes ||
      (Array.isArray(fromFile?.releaseNotes) ? fromFile.releaseNotes : []) ||
      DEFAULT_MANIFEST.releaseNotes,
    publishedAt:
      process.env.RELEASE_PUBLISHED_AT ||
      fromFile?.publishedAt ||
      null,
  };

  return cached;
}

/** Test helper */
export function clearReleaseManifestCache(): void {
  cached = null;
}
