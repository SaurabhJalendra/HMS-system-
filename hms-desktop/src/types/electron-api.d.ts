export type ElectronAPI = {
  setAppIcon?: (dataUrl: string) => Promise<{ ok: boolean }>;
  getApiUrl?: () => Promise<{ url: string; isPackaged: boolean }>;
  setApiUrl?: (
    url: string
  ) => Promise<{ ok: true; url: string } | { ok: false; error?: string }>;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
