import type { ZenHospUpdaterAPI } from "../../types/zenhosp-updater";

export function getZenHospUpdater(): ZenHospUpdaterAPI | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { zenhospUpdater?: ZenHospUpdaterAPI })
    .zenhospUpdater;
}

export function isZenHospUpdaterAvailable(): boolean {
  return Boolean(getZenHospUpdater());
}
