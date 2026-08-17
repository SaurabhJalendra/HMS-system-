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
  info: VersionInfo,
  githubLatest?: string | null
): VersionCompatibility {
  if (compareDesktop(desktopVersion, info.minimumDesktopVersion) < 0) {
    return "update_required";
  }
  const advertisedLatest = pickNewerVersion(
    info.latestDesktopVersion,
    githubLatest
  );
  if (advertisedLatest && compareDesktop(desktopVersion, advertisedLatest) < 0) {
    return "update_recommended";
  }
  return "compatible";
}

export function pickNewerVersion(
  a?: string | null,
  b?: string | null
): string | null {
  const left = (a || "").trim();
  const right = (b || "").trim();
  if (!left) return right || null;
  if (!right) return left;
  return compareDesktop(left, right) >= 0 ? left : right;
}

export function normalizeDesktopVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "").split("-")[0];
}

export async function fetchGitHubLatestDesktopVersion(
  owner: string,
  repo: string
): Promise<{ version: string; name: string; notes: string[] } | null> {
  if (!owner || !repo) return null;
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" }, redirect: "follow" }
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    tag_name?: string;
    name?: string;
    body?: string;
  };
  const version = normalizeDesktopVersion(body.tag_name || body.name || "");
  if (!version) return null;
  const notes = (body.body || "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return { version, name: body.name || `v${version}`, notes };
}

export function compareDesktop(a: string, b: string): number {
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
