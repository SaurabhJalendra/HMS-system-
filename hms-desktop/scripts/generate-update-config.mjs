#!/usr/bin/env node
/**
 * Writes src/main/update-config.json for packaged Electron builds.
 *
 * GitHub Releases (default):
 *   ZENHOSP_UPDATE_PROVIDER=github (default)
 *   ZENHOSP_GITHUB_OWNER=SaurabhJalendra (default)
 *   ZENHOSP_GITHUB_REPO=HMS-system- (default)
 *
 * Optional generic/S3 fallback (not used for desktop updates after SKY-196):
 *   ZENHOSP_UPDATE_PROVIDER=generic
 *   ZENHOSP_UPDATE_FEED_URL=https://...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");

const provider = (process.env.ZENHOSP_UPDATE_PROVIDER || "github").trim().toLowerCase();

const manifestPath = path.join(desktopRoot, "release", "version.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { version: "1.0.0" };
const version = manifest.version || "1.0.0";

let config;

if (provider === "github") {
  const owner = (process.env.ZENHOSP_GITHUB_OWNER || "SaurabhJalendra").trim();
  const repo = (process.env.ZENHOSP_GITHUB_REPO || "HMS-system-").trim();

  if (!owner || !repo) {
    console.error("GitHub update config requires ZENHOSP_GITHUB_OWNER and ZENHOSP_GITHUB_REPO.");
    process.exit(1);
  }

  config = {
    provider: "github",
    owner,
    repo,
    version,
  };
} else if (provider === "generic") {
  const region = process.env.AWS_REGION || "ap-south-1";
  const bucket = (process.env.ZENHOSP_UPDATE_S3_BUCKET || "").trim();
  const prefix = (process.env.ZENHOSP_UPDATE_S3_PREFIX || "desktop-updates").replace(/^\/|\/$/g, "");

  let feedUrl = (process.env.ZENHOSP_UPDATE_FEED_URL || "").trim();
  if (!feedUrl && bucket && prefix) {
    feedUrl = `https://${bucket}.s3.${region}.amazonaws.com/${prefix}/`;
  }

  config = {
    provider: "generic",
    feedUrl: feedUrl || null,
    version,
  };

  if (!feedUrl) {
    console.warn(
      "ZENHOSP_UPDATE_FEED_URL not set — packaged app will need the env var at runtime or rebuild with feed URL."
    );
  }
} else {
  console.error(`Unsupported ZENHOSP_UPDATE_PROVIDER="${provider}". Use "github" or "generic".`);
  process.exit(1);
}

const outPath = path.join(desktopRoot, "src", "main", "update-config.json");
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${path.relative(desktopRoot, outPath)}`);
console.log(JSON.stringify(config, null, 2));
