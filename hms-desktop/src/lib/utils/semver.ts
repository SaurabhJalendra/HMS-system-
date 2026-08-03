/**
 * Minimal semver comparison (major.minor.patch pre-release ignored).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((part) => parseInt(part, 10) || 0);

  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length, 3);

  for (let i = 0; i < len; i += 1) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isVersionLessThan(current: string, minimum: string): boolean {
  return compareSemver(current, minimum) < 0;
}

export function isVersionGreaterThan(current: string, target: string): boolean {
  return compareSemver(current, target) > 0;
}
