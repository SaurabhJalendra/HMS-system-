#!/usr/bin/env node
/**
 * Upload Squirrel artifacts from release/installer-artifacts/ to S3.
 *
 * Required env:
 *   ZENHOSP_UPDATE_S3_BUCKET
 * Optional:
 *   ZENHOSP_UPDATE_S3_PREFIX (default: zenhosp/desktop)
 *   AWS_REGION (default: ap-south-1)
 *
 * Requires AWS CLI configured (aws s3 sync).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const artifactsDir = path.join(desktopRoot, "release", "installer-artifacts");

const bucket = process.env.ZENHOSP_UPDATE_S3_BUCKET?.trim();
const prefix = (process.env.ZENHOSP_UPDATE_S3_PREFIX || "zenhosp/desktop").replace(/^\/|\/$/g, "");
const region = process.env.AWS_REGION || "ap-south-1";

if (!bucket) {
  console.error("Set ZENHOSP_UPDATE_S3_BUCKET to publish.");
  process.exit(1);
}

if (!fs.existsSync(artifactsDir)) {
  console.error("Missing release/installer-artifacts — run npm run release:collect first.");
  process.exit(1);
}

const s3Uri = `s3://${bucket}/${prefix}/`;
console.log(`Syncing ${artifactsDir} → ${s3Uri} (region ${region})`);

const result = spawnSync(
  "aws",
  [
    "s3",
    "sync",
    artifactsDir,
    s3Uri,
    "--acl",
    "public-read",
    "--cache-control",
    "max-age=300",
    "--region",
    region,
  ],
  { stdio: "inherit", shell: process.platform === "win32" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const feedUrl = `https://${bucket}.s3.${region}.amazonaws.com/${prefix}/`;
console.log("");
console.log("Publish complete.");
console.log(`Update feed URL (set ZENHOSP_UPDATE_FEED_URL for clients):`);
console.log(`  ${feedUrl}`);
console.log("");
console.log("If using CloudFront, point ZENHOSP_UPDATE_FEED_URL at your distribution origin path instead.");
