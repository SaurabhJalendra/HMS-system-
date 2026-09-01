import { describe, expect, it } from "vitest";
import {
  buildDelayedNsisInstallCommand,
  NSIS_UPDATE_FLAGS,
  quoteWindowsPath,
} from "../../main/nsisUpdateLaunch";

describe("nsisUpdateLaunch", () => {
  it("quotes a Windows installer path", () => {
    expect(quoteWindowsPath("C:\\Temp\\ZenHosp Setup.exe")).toBe(
      '"C:\\Temp\\ZenHosp Setup.exe"'
    );
  });

  it("strips quotes from the path so cmd.exe cannot be injected", () => {
    expect(quoteWindowsPath('C:\\Temp\\"evil.exe')).toBe('"C:\\Temp\\evil.exe"');
  });

  it("builds a delayed silent NSIS command that relaunches the app", () => {
    const dest = "C:\\Users\\lenovo\\AppData\\Local\\Temp\\ZenHosp-Setup.exe";
    const { file, args } = buildDelayedNsisInstallCommand(dest);

    expect(file).toBe("cmd.exe");
    expect(args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    const cmdline = args[3];
    expect(cmdline).toContain("ping 127.0.0.1 -n 3");
    expect(cmdline).toContain(`"${dest}"`);
    for (const flag of NSIS_UPDATE_FLAGS) {
      expect(cmdline).toContain(flag);
    }
  });
});
