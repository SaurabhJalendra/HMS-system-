import { describe, expect, it } from "vitest";
import {
  compareDesktop,
  evaluateVersionCompatibility,
  normalizeDesktopVersion,
  pickNewerVersion,
  type VersionInfo,
} from "../../lib/api/services/versionService";

const baseInfo = (overrides: Partial<VersionInfo> = {}): VersionInfo => ({
  backendVersion: "1.0.0",
  minimumDesktopVersion: "1.0.0",
  latestDesktopVersion: "1.0.0",
  releaseNotes: [],
  publishedAt: null,
  serverTime: "2026-08-17T00:00:00.000Z",
  ...overrides,
});

describe("versionService", () => {
  it("normalizes GitHub tags", () => {
    expect(normalizeDesktopVersion("v1.0.1")).toBe("1.0.1");
    expect(normalizeDesktopVersion("1.0.1-setup")).toBe("1.0.1");
  });

  it("picks the newer of API and GitHub versions", () => {
    expect(pickNewerVersion("1.0.0", "1.0.1")).toBe("1.0.1");
    expect(pickNewerVersion("v1.0.1", "1.0.0")).toBe("v1.0.1");
  });

  it("recommends an update when GitHub is ahead of the installed build", () => {
    expect(
      evaluateVersionCompatibility("1.0.0", baseInfo(), "1.0.1")
    ).toBe("update_recommended");
  });

  it("stays compatible when current matches GitHub latest", () => {
    expect(
      evaluateVersionCompatibility("1.0.1", baseInfo({ latestDesktopVersion: "1.0.0" }), "1.0.1")
    ).toBe("compatible");
  });

  it("compares dotted versions", () => {
    expect(compareDesktop("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareDesktop("1.0.0", "1.0.1")).toBeLessThan(0);
  });
});
