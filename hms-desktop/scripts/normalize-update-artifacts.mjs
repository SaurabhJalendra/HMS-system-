/**
 * electron-updater's GitHub provider turns spaces into hyphens.
 * GitHub stores "ZenHosp - Hospital …" as "ZenHosp.-.Hospital.…".
 * Those names 404. Rewrite artifacts + latest.yml to the hyphenated names
 * the desktop updater actually requests.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function githubUpdaterFileName(name) {
  return String(name || "").replace(/ /g, "-");
}

function ymlSetupName(yml) {
  const match = String(yml).match(/^\s*(?:url|path):\s*(.+\.exe)\s*$/m);
  return match ? match[1].trim() : null;
}

function renameIfNeeded(dir, fromName, toName, renamed) {
  if (!fromName || !toName || fromName === toName) return;
  const src = path.join(dir, fromName);
  const dest = path.join(dir, toName);
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest) && dest !== src) fs.rmSync(dest, { force: true });
  fs.renameSync(src, dest);
  renamed.push(`${fromName} -> ${toName}`);
}

export function normalizeUpdateArtifacts(artifactsDir) {
  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Missing artifacts dir: ${artifactsDir}`);
  }

  const ymlPath = path.join(artifactsDir, "latest.yml");
  if (!fs.existsSync(ymlPath)) {
    throw new Error(`Missing latest.yml in ${artifactsDir}`);
  }

  let yml = fs.readFileSync(ymlPath, "utf8");
  const fromYml = ymlSetupName(yml);
  const names = fs.readdirSync(artifactsDir);
  const exeName = names.find((name) => name.endsWith(".exe") && !name.endsWith(".blockmap"));
  const blockmapName = names.find((name) => name.endsWith(".exe.blockmap"));
  const targetExe = githubUpdaterFileName(fromYml || exeName || "");
  const targetBlockmap = targetExe ? `${targetExe}.blockmap` : "";
  const renamed = [];

  renameIfNeeded(artifactsDir, exeName, targetExe, renamed);
  renameIfNeeded(artifactsDir, blockmapName, targetBlockmap, renamed);

  if (fromYml && fromYml !== targetExe) {
    yml = yml.split(fromYml).join(targetExe);
  }
  fs.writeFileSync(ymlPath, yml);
  return { renamed, latestYml: yml, setupFile: targetExe };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir =
    process.argv[2] ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "release", "installer-artifacts");
  const result = normalizeUpdateArtifacts(dir);
  console.log(`Normalized artifacts in ${dir}`);
  for (const line of result.renamed) console.log(`  ${line}`);
  if (result.renamed.length === 0) console.log("  (names already match electron-updater)");
}
