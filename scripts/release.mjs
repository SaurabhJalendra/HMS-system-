#!/usr/bin/env node
/**
 * Automated Release Script for ZenHosp (HMS-system)
 *
 * Automates the complete release flow in a single command:
 * 1. Bumps / syncs version across all 5 version files:
 *    - package.json (root)
 *    - hms-desktop/package.json
 *    - hms-desktop/backend/package.json
 *    - hms-desktop/release/version.json
 *    - hms-desktop/backend/api/data/release-version.json
 * 2. Updates release notes and publishedAt timestamp.
 * 3. Commits changes on current branch (e.g. dev).
 * 4. Pushes current branch to origin.
 * 5. Merges dev into main and pushes main (triggers backend deploy).
 * 6. Creates and pushes git tag v<version> (triggers desktop installer build).
 * 7. Restores your working branch back to dev.
 *
 * Usage:
 *   npm run release -- patch "Add doctor consultation fee"
 *   npm run release -- minor "New OT module"
 *   npm run release -- major "ZenHosp 2.0"
 *   npm run release -- 1.0.7 "Re-publish version 1.0.7"
 *   npm run release -- current "Publish existing version in package.json"
 *
 * Options:
 *   --dry-run      Simulate the release without committing, merging, or pushing
 *   --no-push      Commit and tag locally, but do not push to remote
 *   --skip-merge   Tag current branch without merging to main
 *   --min-desktop  Set minimum supported desktop version (default: keeps existing or 1.0.0)
 *   --help, -h     Show this help message
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const desktopRoot = path.join(repoRoot, "hms-desktop");
const backendRoot = path.join(desktopRoot, "backend");

// ---------------- Helper Utilities ----------------

function run(cmd, options = {}) {
  const silent = options.silent ?? false;
  try {
    return execSync(cmd, {
      cwd: options.cwd || repoRoot,
      encoding: "utf8",
      stdio: silent ? "pipe" : "inherit",
    });
  } catch (err) {
    if (options.ignoreError) return null;
    throw new Error(`Command failed: ${cmd}\n${err.message || ""}`);
  }
}

function parseSemver(v) {
  const match = String(v || "").trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    raw: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}`,
  };
}

function bumpSemver(current, type) {
  const parsed = parseSemver(current);
  if (!parsed) throw new Error(`Invalid current version: "${current}"`);
  switch (type.toLowerCase()) {
    case "major":
      return `${parsed.major + 1}.0.0`;
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case "patch":
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    default:
      throw new Error(`Unknown bump type "${type}". Use "patch", "minor", "major", or explicit version like "1.0.8"`);
  }
}

function printHeader() {
  console.log("\n=======================================================");
  console.log("   🚀  ZenHosp Automated Release Manager");
  console.log("=======================================================\n");
}

function printHelp() {
  printHeader();
  console.log(`Usage:
  npm run release [bump_type | version] [release_notes...] [options]

Examples:
  npm run release patch "Add doctor consultation fee and billing"
  npm run release minor "New OT surgical module"
  npm run release 1.0.8 "Fix version sync and release updater"
  npm run release current "Re-tag and push current version"

Options:
  --dry-run       Preview changes without writing files or git push
  --no-push       Commit and tag locally, but do not push to origin
  --skip-merge    Do not merge into main; only tag current branch
  --min-desktop   Set minimum supported desktop version (e.g. --min-desktop 1.0.0)
  --help, -h      Show this help message
`);
}

// ---------------- Argument Parsing ----------------

const rawArgs = process.argv.slice(2);

if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  printHelp();
  process.exit(0);
}

const isDryRun = rawArgs.includes("--dry-run");
const noPush = rawArgs.includes("--no-push");
const skipMerge = rawArgs.includes("--skip-merge");

const minDesktopIdx = rawArgs.indexOf("--min-desktop");
const cliMinDesktop = minDesktopIdx >= 0 && rawArgs[minDesktopIdx + 1] ? rawArgs[minDesktopIdx + 1] : null;

// Filter out options and flags
const filteredArgs = rawArgs.filter((arg, idx) => {
  if (arg.startsWith("-")) return false;
  if (idx > 0 && rawArgs[idx - 1] === "--min-desktop") return false;
  return true;
});

let versionInput = filteredArgs[0] || "";
let releaseNotes = [];

if (
  versionInput &&
  (versionInput.toLowerCase() === "patch" ||
    versionInput.toLowerCase() === "minor" ||
    versionInput.toLowerCase() === "major" ||
    versionInput.toLowerCase() === "current" ||
    parseSemver(versionInput))
) {
  releaseNotes = filteredArgs.slice(1);
} else {
  // If first arg is not a version/type, treat all filtered args as release notes and default to patch
  if (versionInput) {
    releaseNotes = filteredArgs;
  }
  versionInput = "patch";
}

// ---------------- Main Execution ----------------

async function main() {
  printHeader();

  // 1. Verify Git Status & Branch
  const currentBranch = run("git rev-parse --abbrev-ref HEAD", { silent: true }).trim();
  console.log(`📍 Current Git Branch: ${currentBranch}`);

  // 2. Read existing package.json
  const rootPkgPath = path.join(repoRoot, "package.json");
  const desktopPkgPath = path.join(desktopRoot, "package.json");
  const backendPkgPath = path.join(backendRoot, "package.json");
  const manifestPath = path.join(desktopRoot, "release", "version.json");
  const backendManifestPath = path.join(backendRoot, "api", "data", "release-version.json");

  if (!fs.existsSync(desktopPkgPath)) {
    throw new Error(`Cannot find hms-desktop/package.json at: ${desktopPkgPath}`);
  }

  const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf8"));
  const currentVersion = desktopPkg.version || "1.0.0";
  console.log(`📦 Current Desktop Version: ${currentVersion}`);

  // 3. Resolve Target Version
  let targetVersion = currentVersion;
  if (versionInput.toLowerCase() === "current") {
    targetVersion = currentVersion;
  } else if (
    versionInput.toLowerCase() === "patch" ||
    versionInput.toLowerCase() === "minor" ||
    versionInput.toLowerCase() === "major"
  ) {
    targetVersion = bumpSemver(currentVersion, versionInput);
  } else {
    const parsed = parseSemver(versionInput);
    if (!parsed) {
      throw new Error(`Invalid version format: "${versionInput}". Must be valid semver like "1.0.8" or "patch|minor|major"`);
    }
    targetVersion = parsed.raw;
  }

  console.log(`🎯 Target Release Version: v${targetVersion}`);

  // 4. Resolve Release Notes
  const existingManifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {};

  if (releaseNotes.length === 0) {
    if (Array.isArray(existingManifest.releaseNotes) && existingManifest.releaseNotes.length > 0) {
      releaseNotes = existingManifest.releaseNotes;
    } else {
      releaseNotes = [`ZenHosp Release v${targetVersion}`];
    }
  }

  const notesSummary = releaseNotes.join("; ");
  console.log(`📝 Release Notes:`);
  releaseNotes.forEach((n) => console.log(`   • ${n}`));

  const minDesktop =
    cliMinDesktop ||
    existingManifest.minimumDesktopVersion ||
    "1.0.0";

  const nextManifest = {
    version: targetVersion,
    backendVersion: targetVersion,
    minimumDesktopVersion: minDesktop,
    latestDesktopVersion: targetVersion,
    releaseNotes,
    publishedAt: new Date().toISOString(),
  };

  if (isDryRun) {
    console.log("\n[DRY RUN] Would write following manifest:");
    console.log(JSON.stringify(nextManifest, null, 2));
    console.log("\n[DRY RUN] Finished without making any changes.");
    return;
  }

  // 5. Update Version Files
  console.log("\n✍️  Updating version files...");

  // Root package.json
  if (fs.existsSync(rootPkgPath)) {
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
    rootPkg.version = targetVersion;
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
    console.log(`   ✓ package.json -> ${targetVersion}`);
  }

  // Desktop package.json
  desktopPkg.version = targetVersion;
  fs.writeFileSync(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + "\n");
  console.log(`   ✓ hms-desktop/package.json -> ${targetVersion}`);

  // Backend package.json
  if (fs.existsSync(backendPkgPath)) {
    const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, "utf8"));
    backendPkg.version = targetVersion;
    fs.writeFileSync(backendPkgPath, JSON.stringify(backendPkg, null, 2) + "\n");
    console.log(`   ✓ hms-desktop/backend/package.json -> ${targetVersion}`);
  }

  // Release manifest
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2) + "\n");
  console.log(`   ✓ hms-desktop/release/version.json`);

  // Backend version copy
  fs.mkdirSync(path.dirname(backendManifestPath), { recursive: true });
  fs.writeFileSync(backendManifestPath, JSON.stringify(nextManifest, null, 2) + "\n");
  console.log(`   ✓ hms-desktop/backend/api/data/release-version.json`);

  // 6. Git Commit on Current Branch
  console.log(`\n📦 Staging and committing changes on "${currentBranch}"...`);
  run("git add -A");

  try {
    run(`git commit -m "Release v${targetVersion}: ${notesSummary}"`);
    console.log(`   ✓ Committed release v${targetVersion}`);
  } catch {
    console.log(`   ℹ No changes to commit (already up-to-date)`);
  }

  if (noPush) {
    console.log("\n[--no-push] Skipping remote git push and tagging.");
    return;
  }

  // 7. Git Push Current Branch
  console.log(`\n⬆️  Pushing ${currentBranch} to origin...`);
  run(`git push origin ${currentBranch}`);

  // 8. Merge into main if on dev (and not skipped)
  if (currentBranch === "dev" && !skipMerge) {
    console.log("\n🔀 Merging dev into main...");
    run("git checkout main");
    try {
      run("git pull origin main --rebase=false");
      run(`git merge dev -m "Merge branch 'dev' for Release v${targetVersion}"`);
      console.log("   ✓ Merged dev into main");
      console.log("⬆️  Pushing main to origin...");
      run("git push origin main");
      console.log("   ✓ Pushed main to origin (backend deployment triggered)");
    } finally {
      console.log(`🔙 Returning to branch "${currentBranch}"...`);
      run(`git checkout ${currentBranch}`);
    }
  }

  // 9. Create and Push Tag
  const tagName = `v${targetVersion}`;
  console.log(`\n🏷️  Managing Git Tag: ${tagName}...`);

  // Delete GitHub release if exists (e.g. stale or draft release)
  run(`gh release delete ${tagName} -y`, { silent: true, ignoreError: true });

  // Delete local tag if exists
  run(`git tag -d ${tagName}`, { silent: true, ignoreError: true });

  // Delete remote tag if exists (to allow re-tagging)
  run(`git push origin :refs/tags/${tagName}`, { silent: true, ignoreError: true });

  // Create annotated tag
  run(`git tag -a ${tagName} -m "Release v${targetVersion}: ${notesSummary}"`);
  console.log(`   ✓ Created tag ${tagName}`);

  // Push tag to origin
  console.log(`⬆️  Pushing tag ${tagName} to origin...`);
  run(`git push origin ${tagName}`);
  console.log(`   ✓ Pushed tag ${tagName} to origin`);

  // 10. Success Summary
  console.log("\n=======================================================");
  console.log(`   🎉  Release v${targetVersion} Successfully Triggered!`);
  console.log("=======================================================");
  console.log(`• Tag:             ${tagName}`);
  console.log(`• Branch:          ${currentBranch}`);
  console.log(`• GitHub Actions:  https://github.com/SaurabhJalendra/HMS-system-/actions`);
  console.log("\nWhat happens next:");
  console.log("1. GitHub Actions will build the Windows installer and create the GitHub Release.");
  console.log("2. Backend deployment on EC2 will pull latest main automatically if secrets are set.");
  console.log("3. Once the build finishes, open ZenHosp -> Configuration -> App updates -> Check for updates.");
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error(`\n❌ Release Failed: ${err.message || err}`);
  process.exit(1);
});
