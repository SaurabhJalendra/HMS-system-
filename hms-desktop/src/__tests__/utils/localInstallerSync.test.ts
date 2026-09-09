import { describe, expect, it } from "vitest";
import {
  githubUpdaterFileName,
  parseYmlVersion,
} from "../../main/localInstallerSync";

describe("localInstallerSync", () => {
  it("reads the version from latest.yml", () => {
    expect(parseYmlVersion("version: 1.0.7\npath: Setup.exe\n")).toBe("1.0.7");
    expect(parseYmlVersion("version: v1.0.6")).toBe("1.0.6");
  });

  it("normalizes installer names the way GitHub does", () => {
    expect(githubUpdaterFileName("ZenHosp - Hospital Management System Setup 1.0.7.exe")).toBe(
      "ZenHosp---Hospital-Management-System-Setup-1.0.7.exe"
    );
  });
});
