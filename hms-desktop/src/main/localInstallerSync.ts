/**
 * Keep the repo's Setup.exe in sync with the GitHub release used by App updates.
 * Hospital PCs ignore this; it only writes when the HMS-system- folder is present.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type LocalInstallerSyncResult = {
  ok: boolean;
  version?: string;
  copied?: string[];
  skipped?: boolean;
  reason?: string;
  error?: string;
};

const DEFAULT_DESKTOP_ROOTS = [
  "D:\\OneDrive\\HMS-system-\\hms-desktop",
  "D:/OneDrive/HMS-system-/hms-desktop",
];

export function parseYmlVersion(yml: string): string {
  const match = String(yml || "").match(/^\s*version:\s*([^\s]+)\s*$/m);
  return (match?.[1] || "").replace(/^v/i, "").trim();
}

export function githubUpdaterFileName(name: string): string {
  return String(name || "").replace(/ /g, "-");
}

export function isDesktopProjectRoot(dir: string): boolean {
  return (
    existsSync(path.join(dir, "package.json")) &&
    existsSync(path.join(dir, "release", "version.json"))
  );
}

export function resolveDesktopProjectRoot(extra: string[] = []): string | null {
  const fromEnv = (process.env.ZENHOSP_DESKTOP_ROOT || "").trim();
  const candidates = [...extra, fromEnv, process.cwd(), ...DEFAULT_DESKTOP_ROOTS];

  for (const raw of candidates) {
    if (!raw) continue;
    const dir = path.resolve(raw);
    if (isDesktopProjectRoot(dir)) return dir;
    const nested = path.join(dir, "hms-desktop");
    if (isDesktopProjectRoot(nested)) return nested;
  }
  return null;
}

export function localArtifactDirs(desktopRoot: string): string[] {
  const dirs = [path.join(desktopRoot, "release", "installer-artifacts")];
  const nsisX64 = path.join(desktopRoot, "out", "make", "nsis", "x64");
  if (existsSync(nsisX64)) dirs.push(nsisX64);
  return dirs;
}

export function readLocalSetupVersion(desktopRoot: string): string {
  const ymlPath = path.join(desktopRoot, "release", "installer-artifacts", "latest.yml");
  if (!existsSync(ymlPath)) return "";
  try {
    return parseYmlVersion(readFileSync(ymlPath, "utf8"));
  } catch {
    return "";
  }
}

export function writeInstallerIntoDirs(
  dirs: string[],
  sourceExe: string,
  destExeName: string,
  latestYml?: string
): string[] {
  const copied: string[] = [];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (path.resolve(full) === path.resolve(sourceExe)) continue;
      if (/\.exe$/i.test(name) && /setup/i.test(name)) {
        rmSync(full, { force: true });
      }
    }
    const destExe = path.join(dir, destExeName);
    copyFileSync(sourceExe, destExe);
    copied.push(destExe);
    if (latestYml) {
      writeFileSync(path.join(dir, "latest.yml"), latestYml);
    }
  }
  return copied;
}

export function updateLocalVersionManifests(desktopRoot: string, version: string): void {
  const files = [
    path.join(desktopRoot, "release", "version.json"),
    path.join(desktopRoot, "backend", "api", "data", "release-version.json"),
  ];
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const current = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      current.latestDesktopVersion = version;
      if (!current.version) current.version = version;
      writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
    } catch {
      /* leave file alone */
    }
  }
}

export async function downloadText(url: string): Promise<string | null> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  return res.text();
}

export async function downloadFile(url: string, dest: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    return { ok: false, error: `Download failed (${res.status})` };
  }
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(dest)
  );
  return { ok: true };
}

export async function syncLatestInstallerToCodebase(options: {
  owner: string;
  repo: string;
  desktopRoot?: string | null;
  sourceExePath?: string;
  versionHint?: string;
  force?: boolean;
}): Promise<LocalInstallerSyncResult> {
  const desktopRoot = options.desktopRoot || resolveDesktopProjectRoot();
  if (!desktopRoot) {
    return { ok: true, skipped: true, reason: "HMS project folder not found on this PC." };
  }

  const owner = options.owner.trim();
  const repo = options.repo.trim();
  if (!owner || !repo) {
    return { ok: false, error: "GitHub owner/repo is missing from update config." };
  }

  const latestYmlUrl = `https://github.com/${owner}/${repo}/releases/latest/download/latest.yml`;
  const latestYml = await downloadText(latestYmlUrl);
  const remoteVersion = parseYmlVersion(latestYml || "") || (options.versionHint || "").replace(/^v/i, "");
  const localVersion = readLocalSetupVersion(desktopRoot);

  if (!options.force && remoteVersion && localVersion && localVersion === remoteVersion && !options.sourceExePath) {
    return {
      ok: true,
      skipped: true,
      version: remoteVersion,
      reason: `Local Setup.exe is already v${remoteVersion}.`,
    };
  }

  let sourceExe = options.sourceExePath || "";
  let destName = "";

  if (latestYml) {
    const urlMatch = latestYml.match(/^\s*(?:url|path):\s*(.+\.exe)\s*$/m);
    destName = githubUpdaterFileName((urlMatch?.[1] || "").trim());
  }

  if (!sourceExe) {
    const releaseRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      redirect: "follow",
    });
    if (!releaseRes.ok) {
      return { ok: false, error: `GitHub release lookup failed (${releaseRes.status}).` };
    }
    const release = (await releaseRes.json()) as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };
    const asset = (release.assets || []).find(
      (item) => /\.exe$/i.test(item.name) && !/\.blockmap$/i.test(item.name)
    );
    if (!asset?.browser_download_url) {
      return { ok: false, error: "No Setup.exe on the latest GitHub release." };
    }
    destName = destName || githubUpdaterFileName(asset.name);
    const tempDir = path.join(desktopRoot, "release", "installer-artifacts");
    mkdirSync(tempDir, { recursive: true });
    sourceExe = path.join(tempDir, `._download-${destName}`);
    const downloaded = await downloadFile(asset.browser_download_url, sourceExe);
    if (!downloaded.ok) {
      return { ok: false, error: downloaded.error };
    }
  }

  destName = destName || githubUpdaterFileName(path.basename(sourceExe));
  const copied = writeInstallerIntoDirs(
    localArtifactDirs(desktopRoot),
    sourceExe,
    destName,
    latestYml || undefined
  );

  if (sourceExe.includes("._download-") && existsSync(sourceExe) && !copied.includes(sourceExe)) {
    try {
      rmSync(sourceExe, { force: true });
    } catch {
      /* ignore */
    }
  }

  if (remoteVersion) {
    updateLocalVersionManifests(desktopRoot, remoteVersion);
  }

  return { ok: true, version: remoteVersion || localVersion, copied };
}
