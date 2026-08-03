#!/usr/bin/env node
/**
 * Copy Squirrel.Windows installer output into release/installer-artifacts/
 * for upload to S3 / GitHub Releases.
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

function findSquirrelDir(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "squirrel.windows") return full;
      const nested = findSquirrelDir(full);
      if (nested) return nested;
    }
  }
  return null;
}

const squirrelDir = findSquirrelDir(makeRoot);
if (!squirrelDir) {
  console.error("Could not find squirrel.windows output under out/make");
  process.exit(1);
}

const archDirs = fs
  .readdirSync(squirrelDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(squirrelDir, d.name));

const sourceDir = archDirs[0];
if (!sourceDir) {
  console.error("No arch folder under squirrel.windows");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const copied = [];
for (const name of fs.readdirSync(sourceDir)) {
  const src = path.join(sourceDir, name);
  const dest = path.join(outDir, name);
  fs.copyFileSync(src, dest);
  copied.push(name);
}

const manifest = {
  collectedAt: new Date().toISOString(),
  sourceDir,
  files: copied,
};

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(`Collected ${copied.length} files to release/installer-artifacts/`);
for (const f of copied) console.log(`  ${f}`);
