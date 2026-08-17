#!/usr/bin/env node
/**
 * Copy NSIS installer output into release/installer-artifacts/
 * for upload to GitHub Releases (desktop auto-update feed).
 *
 * Expected maker output (Forge MakerNSIS):
 *   out/make/nsis/<arch>/latest.yml
 *   out/make/nsis/<arch>/*Setup*.exe
 *   out/make/nsis/<arch>/*Setup*.exe.blockmap
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const outDir = path.join(desktopRoot, "release", "installer-artifacts");

const makeRoot = path.join(desktopRoot, "out", "make");
if (!fs.existsSync(makeRoot)) {
  console.error("No out/make directory. Run: npm run make");
  process.exit(1);
}

function findNsisDir(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "nsis") return full;
      const nested = findNsisDir(full);
      if (nested) return nested;
    }
  }
  return null;
}

const nsisDir = findNsisDir(makeRoot);
if (!nsisDir) {
  console.error("Could not find nsis output under out/make");
  process.exit(1);
}

const archDirs = fs
  .readdirSync(nsisDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.endsWith("-tmp") && d.name !== "make")
  .map((d) => path.join(nsisDir, d.name));

const sourceDir = archDirs[0];
if (!sourceDir) {
  console.error("No arch folder under out/make/nsis");
  process.exit(1);
}

const requiredPatterns = [
  { label: "latest.yml", test: (name) => name === "latest.yml" },
  { label: "NSIS .exe", test: (name) => name.endsWith(".exe") && !name.endsWith(".blockmap") },
];

const sourceFiles = fs.readdirSync(sourceDir);
for (const { label, test } of requiredPatterns) {
  if (!sourceFiles.some(test)) {
    console.error(`Missing required artifact (${label}) in ${sourceDir}`);
    console.error(`Found: ${sourceFiles.join(", ") || "(empty)"}`);
    process.exit(1);
  }
}

fs.mkdirSync(outDir, { recursive: true });
for (const existing of fs.readdirSync(outDir)) {
  fs.rmSync(path.join(outDir, existing), { force: true, recursive: true });
}

const copied = [];
for (const name of sourceFiles) {
  const src = path.join(sourceDir, name);
  if (!fs.statSync(src).isFile()) continue;
  const dest = path.join(outDir, name);
  fs.copyFileSync(src, dest);
  copied.push(name);
}

const manifest = {
  collectedAt: new Date().toISOString(),
  sourceDir,
  packaging: "nsis",
  files: copied,
};

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(`Collected ${copied.length} files to release/installer-artifacts/`);
for (const f of copied) console.log(`  ${f}`);
