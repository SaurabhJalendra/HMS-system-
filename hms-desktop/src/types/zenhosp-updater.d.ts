export type UpdaterEventPayload = {
  type: string;
  data?: unknown;
};

export type ZenHospUpdaterAPI = {
  getVersion: () => Promise<{
    version: string;
    isPackaged: boolean;
  }>;
  checkForUpdates: () => Promise<{
    ok: boolean;
    skipped?: boolean;
    error?: string;
    updateInfo?: unknown;
  }>;
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
  quitAndInstall: () => Promise<{ ok: boolean }>;
  onUpdaterEvent: (handler: (payload: UpdaterEventPayload) => void) => () => void;
};

declare global {
  interface Window {
    zenhospUpdater?: ZenHospUpdaterAPI;
  }
}

export {};
