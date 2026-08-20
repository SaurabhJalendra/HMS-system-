import { ipcMain, app, BrowserWindow, shell } from "electron";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import bundledUpdateConfig from "./update-config.json";

type BundledUpdateConfig = {
  provider?: string;
  owner?: string;
  repo?: string;
  feedUrl?: string | null;
  version?: string;
};

const updateConfig = bundledUpdateConfig as BundledUpdateConfig;

let targetWindow: BrowserWindow | null = null;
let listenersBound = false;
let feedConfigured = false;

function sendToRenderer(payload: { type: string; data?: unknown }) {
  try {
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send("updater:event", payload);
    }
  } catch {
    // ignore
  }
}

function resolveGenericFeedUrl(): string | null {
  const fromEnv = process.env.ZENHOSP_UPDATE_FEED_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromBundle = updateConfig?.feedUrl?.trim();
  if (fromBundle) return fromBundle;
  return null;
}

function configureFeedIfNeeded(): boolean {
  if (feedConfigured) return true;

  const provider = (updateConfig?.provider || "github").toLowerCase();

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

async function downloadAndOpenGithubInstaller(): Promise<{
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
    if (version && compareAppVersion(app.getVersion(), version) >= 0) {
      const msg = `GitHub latest is v${version}, which is already installed. Publish a newer release (Setup.exe + latest.yml), then try again.`;
      sendToRenderer({ type: "update-not-available", data: { version } });
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

    const opened = await shell.openPath(dest);
    if (opened) {
      const msg = `Downloaded ${asset.name} but Windows could not open it: ${opened}`;
      sendToRenderer({ type: "error", data: { message: msg } });
      return { ok: false, error: msg };
    }

    sendToRenderer({
      type: "update-downloaded",
      data: {
        version,
        method: "github-installer",
        releaseNotes: [
          "Windows installer opened. Finish the setup wizard, then reopen ZenHosp.",
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

export function setUpdaterTargetWindow(win: BrowserWindow | null) {
  targetWindow = win;
}

let ipcRegistered = false;

export function registerUpdaterIpcOnce(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  bindAutoUpdaterListenersOnce();

  ipcMain.handle("updater:get-version", () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    githubOwner: updateConfig?.owner || process.env.ZENHOSP_GITHUB_OWNER || "",
    githubRepo: updateConfig?.repo || process.env.ZENHOSP_GITHUB_REPO || "",
  }));

  ipcMain.handle("updater:check", async () => {
    const allowDev =
      process.env.ZENHOSP_UPDATER_TEST_DEV === "1" ||
      process.env.ZENHOSP_UPDATER_TEST_DEV === "true";
    if (!app.isPackaged && !allowDev) {
      sendToRenderer({
        type: "dev-skipped",
        data: {
          message:
            "Updates are disabled in unpackaged dev runs. Set ZENHOSP_UPDATER_TEST_DEV=1 to test, or use a packaged build.",
        },
      });
      return { ok: true, skipped: true as const };
    }

    if (!configureFeedIfNeeded()) {
      const msg = feedNotConfiguredMessage();
      sendToRenderer({ type: "error", data: { message: msg } });
      return { ok: false, error: msg };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
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
      sendToRenderer({ type: "error", data: { message: friendly } });
      return { ok: false, error: friendly };
    }
  });

  ipcMain.handle("updater:download", async () => {
    if (!app.isPackaged && process.env.ZENHOSP_UPDATER_TEST_DEV !== "1" && process.env.ZENHOSP_UPDATER_TEST_DEV !== "true") {
      return { ok: false, error: "Download skipped in development (unpackaged)." };
    }
    if (configureFeedIfNeeded()) {
      try {
        await autoUpdater.downloadUpdate();
        return { ok: true, method: "electron-updater" as const };
      } catch {
        /* fall through to GitHub Setup.exe */
      }
    }
    return downloadAndOpenGithubInstaller();
  });

  ipcMain.handle("updater:install-github-release", async () => {
    return downloadAndOpenGithubInstaller();
  });

  ipcMain.handle("updater:quit-and-install", () => {
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
    return { ok: true };
  });
}
