/**
 * Windows NSIS launch helpers for in-app updates.
 * Kept free of Electron imports so the command builder can be unit-tested.
 *
 * Do not use cmd.exe — it flashes a terminal. A hidden wscript helper waits
 * for ZenHosp to exit, then runs the installer with no window.
 */

import type { SpawnOptions } from "node:child_process";

export const NSIS_UPDATE_FLAGS = ["--updated", "/S", "--force-run"] as const;

/** CREATE_NO_WINDOW — console process starts with no visible terminal. */
export const WINDOWS_CREATE_NO_WINDOW = 0x08000000;

export function quoteWindowsPath(filePath: string): string {
  return `"${filePath.replace(/"/g, "")}"`;
}

export function escapeVbsString(value: string): string {
  return value.replace(/"/g, '""');
}

/**
 * VBScript: wait ~3s (so Program Files unlocks), then run the NSIS installer
 * hidden. Window style 0 = no UI.
 */
export function buildHiddenInstallScript(installerPath: string): string {
  const exe = escapeVbsString(installerPath);
  const flags = NSIS_UPDATE_FLAGS.join(" ");
  return [
    "On Error Resume Next",
    "WScript.Sleep 3000",
    "Dim sh",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${exe}"" ${flags}", 0, False`,
    "",
  ].join("\r\n");
}

export function hiddenHelperSpawnSpec(scriptPath: string): {
  file: string;
  args: string[];
  options: SpawnOptions;
} {
  return {
    file: "wscript.exe",
    args: ["//B", "//Nologo", scriptPath],
    options: {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsCreationFlags: WINDOWS_CREATE_NO_WINDOW,
    },
  };
}
