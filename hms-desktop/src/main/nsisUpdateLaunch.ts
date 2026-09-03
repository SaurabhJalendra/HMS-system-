/**
 * Windows NSIS launch helpers for in-app updates.
 * Kept free of Electron imports so the command builder can be unit-tested.
 */

export const NSIS_UPDATE_FLAGS = ["--updated", "/S", "--force-run"] as const;

export function quoteWindowsPath(filePath: string): string {
  return `"${filePath.replace(/"/g, "")}"`;
}

/**
 * Build a delayed `cmd.exe` start so Electron can exit and unlock Program Files
 * before NSIS replaces them. Avoids:
 * - "cannot be closed. Please close it manually"
 * - "Failed to uninstall old application files.: 2"
 */
export function buildDelayedNsisInstallCommand(installerPath: string): {
  file: string;
  args: string[];
} {
  const quoted = quoteWindowsPath(installerPath);
  const flags = NSIS_UPDATE_FLAGS.join(" ");
  // ping -n 3 ≈ 2s on Windows
  const cmdline = `ping 127.0.0.1 -n 3 > nul & ${quoted} ${flags}`;
  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", cmdline],
  };
}
