import apiClient from "./config";
import { config } from "../../config/environment";

export const PACKAGED_DEFAULT_API_URL = "http://13.235.103.44:3000/api";

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

export function getFallbackApiUrl(): string {
  const fromVite = String(import.meta.env.VITE_API_URL || "").trim();
  if (fromVite && !(import.meta.env.PROD && isLoopbackApiUrl(fromVite))) {
    return normalizeApiUrl(fromVite);
  }
  if (import.meta.env.DEV) {
    return normalizeApiUrl(fromVite || "http://localhost:3000/api");
  }
  return PACKAGED_DEFAULT_API_URL;
}

export function applyApiUrl(raw: string): string {
  const next = normalizeApiUrl(raw) || getFallbackApiUrl();
  apiClient.defaults.baseURL = next;
  config.API_URL = next;
  return next;
}

export async function resolveStartupApiUrl(): Promise<string> {
  const api = window.electronAPI;
  if (api?.getApiUrl) {
    try {
      const saved = await api.getApiUrl();
      if (saved?.url) {
        return applyApiUrl(saved.url);
      }
    } catch {
      /* fall through */
    }
  }
  return applyApiUrl(getFallbackApiUrl());
}

export async function persistApiUrl(raw: string): Promise<string> {
  const next = applyApiUrl(raw);
  if (window.electronAPI?.setApiUrl) {
    const result = await window.electronAPI.setApiUrl(next);
    if (result?.ok && result.url) {
      return applyApiUrl(result.url);
    }
    if (result && result.ok === false && result.error) {
      throw new Error(result.error);
    }
  }
  return next;
}
