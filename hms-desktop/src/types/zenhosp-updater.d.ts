export type UpdaterEventPayload = {
  type: string;
  data?: unknown;
};

export type ZenHospUpdaterAPI = {
  getVersion: () => Promise<{
    version: string;
    isPackaged: boolean;
    provider?: string;
    githubOwner?: string;
    githubRepo?: string;
    feedUrl?: string;
    localDesktopRoot?: string;
    localSetupVersion?: string;
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
  syncLocalInstaller?: () => Promise<{
    ok: boolean;
    skipped?: boolean;
    version?: string;
    reason?: string;
    error?: string;
    copied?: string[];
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
