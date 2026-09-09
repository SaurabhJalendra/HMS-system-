import { ipcMain, app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import {
  buildHiddenInstallScript,
  hiddenHelperSpawnSpec,
} from "./nsisUpdateLaunch";
import bundledUpdateConfig from "./update-config.json";
import { resolveStoredApiUrl } from "./api-url-store";
import {
  readLocalSetupVersion,
  resolveDesktopProjectRoot,
  syncLatestInstallerToCodebase,
} from "./localInstallerSync";

type UpdateProvider = "github" | "generic";

type BundledUpdateConfig = {
  provider?: string;
  owner?: string;
  repo?: string;
  feedUrl?: string | null;
  version?: string;
};

type RemoteUpdateFeed = {
  provider?: string;
  owner?: string;
  repo?: string;
  feedUrl?: string | null;
};

const updateConfig: BundledUpdateConfig = {
  ...(bundledUpdateConfig as BundledUpdateConfig),
};

let targetWindow: BrowserWindow | null = null;
let listenersBound = false;
let feedConfigured = false;
let silentCheckStarted = false;
let pendingGithubInstaller: { path: string; version?: string } | null = null;

function sendToRenderer(payload: { type: string; data?: unknown }) {
  try {
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send("updater:event", payload);
    }
  } catch {
    // ignore
  }
}

function allowDevUpdater(): boolean {
  return (
    process.env.ZENHOSP_UPDATER_TEST_DEV === "1" ||
    process.env.ZENHOSP_UPDATER_TEST_DEV === "true"
  );
}

function updatesAllowed(): boolean {
  return app.isPackaged || allowDevUpdater();
}

function resolveGenericFeedUrl(): string | null {
  const fromEnv = process.env.ZENHOSP_UPDATE_FEED_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromBundle = updateConfig?.feedUrl?.trim();
  if (fromBundle) return fromBundle;
  return null;
}

function applyRemoteFeed(remote: RemoteUpdateFeed | null | undefined): void {
  if (!remote) return;
  const provider = (remote.provider || "").trim().toLowerCase();
  if (provider === "github" || provider === "generic") {
    updateConfig.provider = provider;
    feedConfigured = false;
  }
  if (remote.owner?.trim()) updateConfig.owner = remote.owner.trim();
  if (remote.repo?.trim()) updateConfig.repo = remote.repo.trim();
  if (remote.feedUrl?.trim()) {
    updateConfig.feedUrl = remote.feedUrl.trim();
    feedConfigured = false;
  }
}

function configureFeedIfNeeded(): boolean {
  if (feedConfigured) return true;

  const provider = (updateConfig?.provider || "github").toLowerCase() as UpdateProvider;

  if (provider === "github") {
    const owner =
      updateConfig?.owner?.trim() ||
      process.env.ZENHOSP_GITHUB_OWNER?.trim() ||
      "";
    const repo =
      updateConfig?.repo?.trim() ||
      process.env.ZENHOSP_GITHUB_REPO?.trim() ||
      "";

    if (!owner || !repo) {
      return false;
    }

    autoUpdater.setFeedURL({
      provider: "github",
      owner,
      repo,
    });
    feedConfigured = true;
    return true;
  }

  if (provider === "generic") {
    const url = resolveGenericFeedUrl();
    if (!url) return false;

    autoUpdater.setFeedURL({
      provider: "generic",
      url: url.endsWith("/") ? url : `${url}/`,
    });
    feedConfigured = true;
    return true;
  }

  return false;
}

function feedNotConfiguredMessage(): string {
  const provider = (updateConfig?.provider || "github").toLowerCase();
  if (provider === "github") {
    return "Update feed is not configured. Set provider/owner/repo in update-config.json (or ZENHOSP_GITHUB_OWNER / ZENHOSP_GITHUB_REPO).";
  }
  return "Update feed is not configured. Set ZENHOSP_UPDATE_FEED_URL for the generic provider.";
}

function compareAppVersion(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((part) => parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function mergeFeedFromBackend(): Promise<void> {
  try {
    const apiUrl = resolveStoredApiUrl();
    if (!apiUrl) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/version`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return;
    const body = (await res.json()) as {
      data?: { update?: RemoteUpdateFeed };
      update?: RemoteUpdateFeed;
    };
    applyRemoteFeed(body?.data?.update || body?.update);
  } catch {
    /* bundled update-config.json remains the feed */
  }
}

function githubOwner(): string {
  return updateConfig?.owner?.trim() || process.env.ZENHOSP_GITHUB_OWNER?.trim() || "";
}

function githubRepo(): string {
  return updateConfig?.repo?.trim() || process.env.ZENHOSP_GITHUB_REPO?.trim() || "";
}

async function syncLocalInstallerQuiet(options?: {
  sourceExePath?: string;
  versionHint?: string;
  force?: boolean;
}) {
  const result = await syncLatestInstallerToCodebase({
    owner: githubOwner(),
    repo: githubRepo(),
    sourceExePath: options?.sourceExePath,
    versionHint: options?.versionHint,
    force: options?.force,
  });
  if (result.ok && !result.skipped) {
    sendToRenderer({ type: "local-installer-synced", data: result });
  }
  return result;
}

async function downloadGithubInstaller(): Promise<{
  ok: boolean;
  error?: string;
  version?: string;
  method?: string;
}> {
  const owner =
    updateConfig?.owner?.trim() || process.env.ZENHOSP_GITHUB_OWNER?.trim() || "";
  const repo =
    updateConfig?.repo?.trim() || process.env.ZENHOSP_GITHUB_REPO?.trim() || "";
  if (!owner || !repo) {
    return { ok: false, error: feedNotConfiguredMessage() };
  }

  sendToRenderer({ type: "checking-for-update" });
  try {
    const releaseRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" }, redirect: "follow" }
    );
    if (!releaseRes.ok) {
      const msg = `GitHub release lookup failed (${releaseRes.status}).`;
      sendToRenderer({ type: "error", data: { message: msg } });
      return { ok: false, error: msg };
    }
    const release = (await releaseRes.json()) as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string; size?: number }>;
    };
    const version = String(release.tag_name || "").replace(/^v/i, "");
    const appNeedsUpdate = !version || compareAppVersion(app.getVersion(), version) < 0;
    if (version && !appNeedsUpdate) {
      const synced = await syncLocalInstallerQuiet({ versionHint: version });
      const localNote = synced.ok && !synced.skipped
        ? ` Local Setup.exe is now v${synced.version}.`
        : "";
      const msg = `GitHub latest is v${version}, which is already installed.${localNote}`;
      sendToRenderer({ type: "update-not-available", data: { version, localSync: synced } });
      return { ok: false, error: msg };
    }

    const asset = (release.assets || []).find(
      (item) => /\.exe$/i.test(item.name) && !/\.blockmap$/i.test(item.name)
    );
    if (!asset?.browser_download_url) {
      const msg =
        "No Setup.exe on the latest GitHub release. Publish the installer with latest.yml, then try again.";
      sendToRenderer({ type: "error", data: { message: msg } });
      return { ok: false, error: msg };
    }

    sendToRenderer({
      type: "update-available",
      data: { version, releaseNotes: [`GitHub ${release.tag_name}`] },
    });
    sendToRenderer({ type: "download-progress", data: { percent: 1 } });

    const fileRes = await fetch(asset.browser_download_url, { redirect: "follow" });
    if (!fileRes.ok || !fileRes.body) {
      const msg = `Failed to download ${asset.name} (${fileRes.status}).`;
      sendToRenderer({ type: "error", data: { message: msg } });
      return { ok: false, error: msg };
    }

    const dest = path.join(app.getPath("temp"), asset.name);
    const total = Number(asset.size || fileRes.headers.get("content-length") || 0);
    let received = 0;
    const nodeStream = Readable.fromWeb(
      fileRes.body as import("node:stream/web").ReadableStream
    );
    nodeStream.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (total > 0) {
        sendToRenderer({
          type: "download-progress",
          data: { percent: Math.min(99, Math.round((received / total) * 100)) },
        });
      }
    });
    await pipeline(nodeStream, createWriteStream(dest));
    sendToRenderer({ type: "download-progress", data: { percent: 100 } });

    pendingGithubInstaller = { path: dest, version };
    await syncLocalInstallerQuiet({ sourceExePath: dest, versionHint: version, force: true });
    sendToRenderer({
      type: "update-downloaded",
      data: {
        version,
        method: "github-installer",
        releaseNotes: [
          "Download complete. ZenHosp will close, install the update, and reopen. The project Setup.exe was updated too.",
        ],
      },
    });
    return { ok: true, version, method: "github-installer" };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    sendToRenderer({ type: "error", data: { message } });
    return { ok: false, error: message };
  }
}

function bindAutoUpdaterListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer({ type: "checking-for-update" });
  });
  autoUpdater.on("update-available", (info) => {
    sendToRenderer({ type: "update-available", data: info });
  });
  autoUpdater.on("update-not-available", (info) => {
    sendToRenderer({ type: "update-not-available", data: info });
  });
  autoUpdater.on("error", (err) => {
    sendToRenderer({
      type: "error",
      data: { message: err?.message || String(err) },
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer({ type: "download-progress", data: progress });
  });
  autoUpdater.on("update-downloaded", (info) => {
    sendToRenderer({ type: "update-downloaded", data: info });
  });
}

function launchHiddenInstallerThenQuit(): {
  ok: boolean;
  error?: string;
  method?: string;
} {
  const installerPath = pendingGithubInstaller?.path;
  if (!installerPath || !existsSync(installerPath)) {
    const msg = "The downloaded installer is missing. Download the update again.";
    sendToRenderer({ type: "error", data: { message: msg } });
    return { ok: false, error: msg };
  }

  try {
    const scriptPath = path.join(app.getPath("temp"), "zenhosp-update-install.vbs");
    writeFileSync(scriptPath, buildHiddenInstallScript(installerPath), "utf8");
    const spec = hiddenHelperSpawnSpec(scriptPath);
    const child = spawn(spec.file, spec.args, spec.options);
    child.unref();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    sendToRenderer({ type: "error", data: { message } });
    return { ok: false, error: message };
  }

  setImmediate(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners("close");
      if (!win.isDestroyed()) win.close();
    }
    app.exit(0);
  });
  return { ok: true, method: "github-installer" };
}

function performQuitAndInstall(): { ok: boolean; error?: string; method?: string } {
  if (pendingGithubInstaller?.path) {
    return launchHiddenInstallerThenQuit();
  }
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      sendToRenderer({ type: "error", data: { message } });
    }
  });
  return { ok: true, method: "electron-updater" };
}

async function checkForUpdatesInternal(options?: { quiet?: boolean }): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
  updateInfo?: unknown;
}> {
  const quiet = Boolean(options?.quiet);
  if (!updatesAllowed()) {
    if (!quiet) {
      sendToRenderer({
        type: "dev-skipped",
        data: {
          message:
            "Updates are disabled in unpackaged dev runs. Set ZENHOSP_UPDATER_TEST_DEV=1 to test, or use a packaged build.",
        },
      });
    }
    return { ok: true, skipped: true as const };
  }

  await mergeFeedFromBackend();

  if (!configureFeedIfNeeded()) {
    const msg = feedNotConfiguredMessage();
    if (!quiet) sendToRenderer({ type: "error", data: { message: msg } });
    return { ok: false, error: msg };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    const nextVersion = (result?.updateInfo as { version?: string } | null)?.version || "";
    if (!nextVersion || compareAppVersion(app.getVersion(), nextVersion) >= 0) {
      await syncLocalInstallerQuiet({ versionHint: nextVersion });
    }
    return {
      ok: true,
      skipped: false as const,
      updateInfo: result?.updateInfo ?? null,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const friendly =
      /Cannot find latest\.yml/i.test(message) ||
      (/latest\.yml/i.test(message) && /404/i.test(message))
        ? "Update feed is incomplete: latest.yml is missing from the GitHub release. Upload latest.yml (with the Setup.exe) to the latest release, then try again."
        : message;
    if (!quiet) sendToRenderer({ type: "error", data: { message: friendly } });
    return { ok: false, error: friendly };
  }
}

async function downloadUpdateInternal(): Promise<{
  ok: boolean;
  error?: string;
  method?: "electron-updater" | "github-installer";
  version?: string;
}> {
  if (!updatesAllowed()) {
    return { ok: false, error: "Download skipped in development (unpackaged)." };
  }
  await mergeFeedFromBackend();
  if (configureFeedIfNeeded()) {
    try {
      await autoUpdater.downloadUpdate();
      await syncLocalInstallerQuiet({ force: true });
      return { ok: true, method: "electron-updater" as const };
    } catch {
      /* fall through to GitHub Setup.exe using the same config owner/repo */
    }
  }
  const fallback = await downloadGithubInstaller();
  return {
    ok: fallback.ok,
    error: fallback.error,
    method: fallback.ok ? "github-installer" : undefined,
    version: fallback.version,
  };
}

/**
 * Packaged app: ask the backend which feed to use, then check/download
 * quietly in the main process. No terminal window.
 */
export async function startSilentUpdateCheck(): Promise<void> {
  if (silentCheckStarted) return;
  silentCheckStarted = true;
  if (!updatesAllowed()) return;

  bindAutoUpdaterListenersOnce();
  const check = await checkForUpdatesInternal({ quiet: true });
  if (check.skipped) return;

  if (check.ok) {
    const nextVersion =
      (check.updateInfo as { version?: string } | null)?.version || "";
    if (nextVersion && compareAppVersion(app.getVersion(), nextVersion) < 0) {
      await downloadUpdateInternal();
    } else {
      await syncLocalInstallerQuiet({ versionHint: nextVersion });
    }
    return;
  }

  if ((updateConfig.provider || "github") === "github") {
    await downloadGithubInstaller();
  }
}

export function setUpdaterTargetWindow(win: BrowserWindow | null) {
  targetWindow = win;
}

let ipcRegistered = false;

export function registerUpdaterIpcOnce(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  bindAutoUpdaterListenersOnce();

  ipcMain.handle("updater:get-version", () => {
    const desktopRoot = resolveDesktopProjectRoot();
    return {
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      provider: updateConfig?.provider || "github",
      githubOwner: githubOwner(),
      githubRepo: githubRepo(),
      feedUrl: updateConfig?.feedUrl || "",
      localDesktopRoot: desktopRoot || "",
      localSetupVersion: desktopRoot ? readLocalSetupVersion(desktopRoot) : "",
    };
  });

  ipcMain.handle("updater:sync-local-installer", async () => {
    await mergeFeedFromBackend();
    return syncLocalInstallerQuiet({ force: true });
  });

  ipcMain.handle("updater:check", async () => {
    return checkForUpdatesInternal();
  });

  ipcMain.handle("updater:download", async () => {
    return downloadUpdateInternal();
  });

  ipcMain.handle("updater:install-github-release", async () => {
    await mergeFeedFromBackend();
    return downloadGithubInstaller();
  });

  ipcMain.handle("updater:quit-and-install", () => {
    return performQuitAndInstall();
  });
}
