export type UpdaterEventPayload = {
  type: string;
  data?: unknown;
};

export type ZenHospUpdaterAPI = {
  getVersion: () => Promise<{
    version: string;
    isPackaged: boolean;
    githubOwner?: string;
    githubRepo?: string;
  }>;
  checkForUpdates: () => Promise<{
    ok: boolean;
    skipped?: boolean;
    error?: string;
    updateInfo?: unknown;
  }>;
  downloadUpdate: () => Promise<{
    ok: boolean;
    error?: string;
    method?: "electron-updater" | "github-installer";
    version?: string;
  }>;
  installFromGitHub?: () => Promise<{
    ok: boolean;
    error?: string;
    method?: string;
    version?: string;
  }>;
  quitAndInstall: () => Promise<{ ok: boolean }>;
  onUpdaterEvent: (handler: (payload: UpdaterEventPayload) => void) => () => void;
};

declare global {
  interface Window {
    zenhospUpdater?: ZenHospUpdaterAPI;
  }
}

export {};
