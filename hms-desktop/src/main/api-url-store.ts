import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import bundled from "./server-defaults.json";

type BundledDefaults = { defaultApiUrl?: string };

const DEFAULT_PACKAGED_API_URL = (
  (bundled as BundledDefaults).defaultApiUrl || "http://13.235.103.44:3000/api"
).trim();

let ipcRegistered = false;

export function normalizeApiUrl(raw: string): string {
  let url = (raw || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  if (!/\/api$/i.test(url)) {
    url = `${url}/api`;
  }
  return url;
}

export function isLoopbackApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function storePath(): string {
  return path.join(app.getPath("userData"), "api-url.json");
}

function readSavedUrl(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), "utf8")) as { apiUrl?: string };
    return normalizeApiUrl(raw.apiUrl || "");
  } catch {
    return "";
  }
}

export function resolveStoredApiUrl(): string {
  const saved = readSavedUrl();
  if (saved && !(app.isPackaged && isLoopbackApiUrl(saved))) {
    return saved;
  }

  const fallback = app.isPackaged
    ? DEFAULT_PACKAGED_API_URL
    : normalizeApiUrl(process.env.VITE_API_URL || "http://localhost:3000/api");

  if (app.isPackaged) {
    try {
      writeStoredApiUrl(fallback);
    } catch {
      /* first-run persist is best-effort */
    }
  }
  return fallback;
}

export function writeStoredApiUrl(raw: string): string {
  const next = normalizeApiUrl(raw);
  if (!next) {
    throw new Error("API URL is required.");
  }
  fs.writeFileSync(storePath(), `${JSON.stringify({ apiUrl: next }, null, 2)}\n`);
  return next;
}

export function registerApiUrlIpcOnce(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("api:get-url", () => ({
    url: resolveStoredApiUrl(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle("api:set-url", (_event, raw: string) => {
    try {
      return { ok: true as const, url: writeStoredApiUrl(String(raw || "")) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
