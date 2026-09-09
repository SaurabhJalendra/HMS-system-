import { describe, expect, it } from "vitest";
import {
  NSIS_UPDATE_FLAGS,
  WINDOWS_CREATE_NO_WINDOW,
  buildHiddenInstallScript,
  escapeVbsString,
  hiddenHelperSpawnSpec,
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

  it("escapes quotes for VBScript", () => {
    expect(escapeVbsString('C:\\Temp\\"evil.exe')).toBe('C:\\Temp\\""evil.exe');
  });

  it("builds a hidden VBS installer that relaunches the app", () => {
    const dest = "C:\\Users\\lenovo\\AppData\\Local\\Temp\\ZenHosp-Setup.exe";
    const script = buildHiddenInstallScript(dest);

    expect(script).toContain("WScript.Sleep 3000");
    expect(script).toContain(dest);
    expect(script).toContain(', 0, False');
    for (const flag of NSIS_UPDATE_FLAGS) {
      expect(script).toContain(flag);
    }
    expect(script).not.toContain("cmd.exe");
    expect(script).not.toContain("ping ");
  });

  it("launches wscript hidden with no console window", () => {
    const spec = hiddenHelperSpawnSpec("C:\\Temp\\zenhosp-update.vbs");
    expect(spec.file).toBe("wscript.exe");
    expect(spec.args).toEqual(["//B", "//Nologo", "C:\\Temp\\zenhosp-update.vbs"]);
    expect(spec.options.windowsHide).toBe(true);
    expect(spec.options.detached).toBe(true);
    expect(spec.options.windowsCreationFlags).toBe(WINDOWS_CREATE_NO_WINDOW);
  });
});
