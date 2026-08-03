#!/usr/bin/env node
/**
 * Sync release/version.json from hms-desktop/package.json and backend package.json.
 * Copies manifest to backend/api/data/release-version.json for the version API.
 *
 * Usage:
 *   node scripts/sync-release-version.mjs
 *   node scripts/sync-release-version.mjs --notes "OT billing" "Pharmacy fixes"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");

const desktopPkg = JSON.parse(
  fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8")
);
const backendPkg = JSON.parse(
  fs.readFileSync(path.join(desktopRoot, "backend", "package.json"), "utf8")
);

const manifestPath = path.join(desktopRoot, "release", "version.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};

const version = desktopPkg.version;

const notesArgIdx = process.argv.indexOf("--notes");
const cliNotes =
  notesArgIdx >= 0 ? process.argv.slice(notesArgIdx + 1).filter((a) => !a.startsWith("-")) : null;

const previousMinimum =
  typeof manifest.minimumDesktopVersion === "string"
    ? manifest.minimumDesktopVersion
    : version;

const next = {
  version,
  backendVersion: version,
  minimumDesktopVersion: manifest.minimumDesktopVersion || previousMinimum,
  latestDesktopVersion: version,
  releaseNotes:
    cliNotes && cliNotes.length > 0
      ? cliNotes
      : Array.isArray(manifest.releaseNotes) && manifest.releaseNotes.length > 0
        ? manifest.releaseNotes
        : [`ZenHosp release ${version}`],
  publishedAt: manifest.publishedAt ?? null,
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);

const backendDataDir = path.join(desktopRoot, "backend", "api", "data");
fs.mkdirSync(backendDataDir, { recursive: true });
fs.writeFileSync(
  path.join(backendDataDir, "release-version.json"),
  `${JSON.stringify(next, null, 2)}\n`
);

backendPkg.version = version;
fs.writeFileSync(
  path.join(desktopRoot, "backend", "package.json"),
  `${JSON.stringify(backendPkg, null, 2)}\n`
);

console.log(`Release manifest synced to v${version}`);
console.log(`  release/version.json`);
console.log(`  backend/api/data/release-version.json`);
