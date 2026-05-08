// Preload script for Electron
// This script runs in a context that has access to both the DOM and Node.js APIs
// but is isolated from the main renderer process for security.

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {});

contextBridge.exposeInMainWorld("zenhospUpdater", {
  getVersion: () => ipcRenderer.invoke("updater:get-version"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  quitAndInstall: () => ipcRenderer.invoke("updater:quit-and-install"),
  onUpdaterEvent: (handler: (payload: { type: string; data?: unknown }) => void) => {
    const listener = (_event: unknown, payload: { type: string; data?: unknown }) => {
      handler(payload);
    };
    ipcRenderer.on("updater:event", listener);
    return () => {
      ipcRenderer.removeListener("updater:event", listener);
    };
  },
});

// Log that preload script has loaded (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('[Preload] Preload script loaded successfully');
}
