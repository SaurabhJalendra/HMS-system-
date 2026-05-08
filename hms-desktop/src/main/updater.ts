import { ipcMain, app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

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

function configureFeedIfNeeded(): boolean {
  const url = process.env.ZENHOSP_UPDATE_FEED_URL?.trim();
  if (url) {
    if (!feedConfigured) {
      autoUpdater.setFeedURL({
        provider: "generic",
        url: url.endsWith("/") ? url : `${url}/`,
      });
      feedConfigured = true;
    }
    return true;
  }
  return false;
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
      const msg =
        "Update feed is not configured. Set environment variable ZENHOSP_UPDATE_FEED_URL to the HTTPS base URL of your Squirrel RELEASES folder (see ZenHosp release docs).";
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
      sendToRenderer({ type: "error", data: { message } });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("updater:download", async () => {
    if (!app.isPackaged && process.env.ZENHOSP_UPDATER_TEST_DEV !== "1" && process.env.ZENHOSP_UPDATER_TEST_DEV !== "true") {
      return { ok: false, error: "Download skipped in development (unpackaged)." };
    }
    if (!configureFeedIfNeeded()) {
      return { ok: false, error: "Update feed not configured (ZENHOSP_UPDATE_FEED_URL)." };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      sendToRenderer({ type: "error", data: { message } });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("updater:quit-and-install", () => {
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
    return { ok: true };
  });
}
