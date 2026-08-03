#!/usr/bin/env node
/**
 * Writes src/main/update-config.json for packaged Electron builds.
 * Feed URL: ZENHOSP_UPDATE_FEED_URL at build time, or placeholder for dev.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");

const feedUrl = (process.env.ZENHOSP_UPDATE_FEED_URL || "").trim();
const manifestPath = path.join(desktopRoot, "release", "version.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { version: "1.0.0" };

const config = {
  feedUrl: feedUrl || null,
  version: manifest.version || "1.0.0",
  provider: "generic",
};

const outPath = path.join(desktopRoot, "src", "main", "update-config.json");
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${path.relative(desktopRoot, outPath)}`);
if (!feedUrl) {
  console.warn(
    "ZENHOSP_UPDATE_FEED_URL not set — packaged app will need the env var at runtime or rebuild with feed URL."
  );
}
