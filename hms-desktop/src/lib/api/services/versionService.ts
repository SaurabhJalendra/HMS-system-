import apiClient from "../config";

export type VersionInfo = {
  backendVersion: string;
  minimumDesktopVersion: string;
  latestDesktopVersion: string;
  releaseNotes: string[];
  publishedAt: string | null;
  serverTime: string;
};

export type VersionCompatibility =
  | "compatible"
  | "update_recommended"
  | "update_required";

export function evaluateVersionCompatibility(
  desktopVersion: string,
  info: VersionInfo
): VersionCompatibility {
  if (compareDesktop(desktopVersion, info.minimumDesktopVersion) < 0) {
    return "update_required";
  }
  if (compareDesktop(desktopVersion, info.latestDesktopVersion) < 0) {
    return "update_recommended";
  }
  return "compatible";
}

function compareDesktop(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((part) => parseInt(part, 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function fetchVersionInfo(): Promise<VersionInfo> {
  const response = await apiClient.get<{ success: boolean; data: VersionInfo }>(
    "/version"
  );
  return response.data.data;
}

const versionService = {
  fetchVersionInfo,
  evaluateVersionCompatibility,
};

export default versionService;
