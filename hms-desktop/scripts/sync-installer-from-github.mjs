/**
 * Download the latest GitHub Setup.exe + latest.yml into
 * hms-desktop/release/installer-artifacts (and out/make/nsis/x64 if present).
 *
 *   node scripts/sync-installer-from-github.mjs
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = require(path.join(desktopRoot, "src", "main", "update-config.json"));

const owner = config.owner || "SaurabhJalendra";
const repo = config.repo || "HMS-system-";
const artifactsDir = path.join(desktopRoot, "release", "installer-artifacts");
mkdirSync(artifactsDir, { recursive: true });

const ymlRes = await fetch(
  `https://github.com/${owner}/${repo}/releases/latest/download/latest.yml`,
  { redirect: "follow" }
);
if (!ymlRes.ok) {
  console.error(`Could not download latest.yml (${ymlRes.status})`);
  process.exit(1);
}
const yml = await ymlRes.text();
const version = (yml.match(/^\s*version:\s*([^\s]+)/m) || [])[1] || "";
const exeFromYml = ((yml.match(/^\s*(?:url|path):\s*(.+\.exe)\s*$/m) || [])[1] || "").trim();

const releaseRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
  headers: { Accept: "application/vnd.github+json" },
  redirect: "follow",
});
if (!releaseRes.ok) {
  console.error(`GitHub release lookup failed (${releaseRes.status})`);
  process.exit(1);
}
const release = await releaseRes.json();
const asset = (release.assets || []).find(
  (item) => /\.exe$/i.test(item.name) && !/\.blockmap$/i.test(item.name)
);
if (!asset) {
  console.error("No Setup.exe on the latest GitHub release.");
  process.exit(1);
}

const destName = (exeFromYml || asset.name).replace(/ /g, "-");
const destExe = path.join(artifactsDir, destName);
console.log(`Downloading ${asset.name} → ${destExe}`);

const fileRes = await fetch(asset.browser_download_url, { redirect: "follow" });
if (!fileRes.ok || !fileRes.body) {
  console.error(`Download failed (${fileRes.status})`);
  process.exit(1);
}
const tempExe = path.join(artifactsDir, `._incoming.exe`);
await pipeline(Readable.fromWeb(fileRes.body), createWriteStream(tempExe));

for (const dir of [artifactsDir, path.join(desktopRoot, "out", "make", "nsis", "x64")]) {
  if (!existsSync(dir) && dir !== artifactsDir) continue;
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (name === "._incoming.exe") continue;
    if (/\.exe$/i.test(name) && /setup/i.test(name)) {
      rmSync(path.join(dir, name), { force: true });
    }
  }
  copyFileSync(tempExe, path.join(dir, destName));
  writeFileSync(path.join(dir, "latest.yml"), yml);
}

rmSync(tempExe, { force: true });

for (const manifestName of [
  path.join(desktopRoot, "release", "version.json"),
  path.join(desktopRoot, "backend", "api", "data", "release-version.json"),
]) {
  if (!existsSync(manifestName)) continue;
  const manifest = JSON.parse(readFileSync(manifestName, "utf8"));
  manifest.latestDesktopVersion = version || manifest.latestDesktopVersion;
  writeFileSync(manifestName, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`Local Setup.exe is now v${version || release.tag_name}`);
