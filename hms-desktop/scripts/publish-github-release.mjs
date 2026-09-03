#!/usr/bin/env node
/**
 * Upload NSIS update artifacts (latest.yml + Setup.exe + .blockmap) to a GitHub Release.
 *
 * electron-updater (GitHub provider) requires latest.yml on the latest release.
 * Uploading only the .exe causes: "Cannot find latest.yml in the latest release artifacts".
 *
 * Usage (do not use `npm run ... -- --tag` — npm swallows --tag):
 *   node scripts/publish-github-release.mjs v1.0.2
 *   node scripts/publish-github-release.mjs --release-tag v1.0.2
 *   $env:ZENHOSP_RELEASE_TAG="v1.0.2"; npm run release:publish-github
 *
 * Env (optional overrides):
 *   ZENHOSP_GITHUB_OWNER (default: SaurabhJalendra)
 *   ZENHOSP_GITHUB_REPO  (default: HMS-system-)
 *   GH_TOKEN or GITHUB_TOKEN — required for upload (gh auth login also works)
 *
 * Prerequisites:
 *   - npm run release:build (or release:collect) so release/installer-artifacts/ has latest.yml
 *   - GitHub CLI (`gh`) installed and authenticated
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeUpdateArtifacts } from "./normalize-update-artifacts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const artifactsDir = path.join(desktopRoot, "release", "installer-artifacts");

const owner = (process.env.ZENHOSP_GITHUB_OWNER || "SaurabhJalendra").trim();
const repo = (process.env.ZENHOSP_GITHUB_REPO || "HMS-system-").trim();

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const positionalTag = process.argv
  .slice(2)
  .find((arg) => arg && !arg.startsWith("-"));
const tag = (
  argValue("--release-tag") ||
  argValue("--tag") ||
  positionalTag ||
  process.env.ZENHOSP_RELEASE_TAG ||
  process.env.npm_config_tag ||
  ""
).trim();
if (!tag || tag === "latest") {
  console.error("Usage: node scripts/publish-github-release.mjs v1.0.2");
  console.error("  or:  node scripts/publish-github-release.mjs --release-tag v1.0.2");
  console.error("  or:  $env:ZENHOSP_RELEASE_TAG=\"v1.0.2\"; npm run release:publish-github");
  process.exit(1);
}

if (!fs.existsSync(artifactsDir)) {
  console.error("Missing release/installer-artifacts — run: npm run release:build");
  process.exit(1);
}

normalizeUpdateArtifacts(artifactsDir);

const files = fs.readdirSync(artifactsDir).filter((name) => {
  const full = path.join(artifactsDir, name);
  return fs.statSync(full).isFile() && name !== "manifest.json" && name !== ".gitkeep";
});

const required = ["latest.yml"];
for (const name of required) {
  if (!files.includes(name)) {
    console.error(`Missing required artifact: ${name}`);
    console.error(`Found: ${files.join(", ") || "(empty)"}`);
    console.error("Run: npm run release:build  (MakerNSIS must emit latest.yml)");
    process.exit(1);
  }
}

const hasExe = files.some((n) => n.endsWith(".exe") && !n.endsWith(".blockmap"));
if (!hasExe) {
  console.error("Missing NSIS Setup .exe in release/installer-artifacts/");
  process.exit(1);
}

const ghCheck = spawnSync("gh", ["--version"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (ghCheck.status !== 0) {
  console.error("GitHub CLI (`gh`) is required. Install: https://cli.github.com/");
  process.exit(1);
}

const repoSlug = `${owner}/${repo}`;
console.log(`Publishing ${files.length} artifacts to ${repoSlug} @ ${tag}`);
for (const f of files) console.log(`  ${f}`);

const view = spawnSync(
  "gh",
  ["release", "view", tag, "--repo", repoSlug],
  { encoding: "utf8", shell: process.platform === "win32" }
);

if (view.status !== 0) {
  console.log(`Release ${tag} not found — creating...`);
  const create = spawnSync(
    "gh",
    [
      "release",
      "create",
      tag,
      ...files.map((f) => path.join(artifactsDir, f)),
      "--repo",
      repoSlug,
      "--target",
      tag,
      "--title",
      `ZenHosp ${tag}`,
      "--notes",
      `Desktop release ${tag} (NSIS + latest.yml for electron-updater).`,
    ],
    { stdio: "inherit", windowsVerbatimArguments: true }
  );
  if (create.status !== 0) process.exit(create.status ?? 1);
} else {
  const upload = spawnSync(
    "gh",
    [
      "release",
      "upload",
      tag,
      ...files.map((f) => path.join(artifactsDir, f)),
      "--repo",
      repoSlug,
      "--clobber",
    ],
    { stdio: "inherit", shell: process.platform === "win32" }
  );
  if (upload.status !== 0) process.exit(upload.status ?? 1);
}

console.log("");
console.log("Done. Verify:");
console.log(
  `  https://github.com/${owner}/${repo}/releases/download/${tag}/latest.yml`
);
console.log(
  `  https://github.com/${owner}/${repo}/releases/latest/download/latest.yml`
);
