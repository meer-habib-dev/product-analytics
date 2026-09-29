/** Semver-ish descending order ("2.10.0" before "2.9.1"); non-numeric parts fall back to string compare. */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split(/[.\-+]/);
  const pb = b.split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = Number(x);
    const ny = Number(y);
    const diff = Number.isFinite(nx) && Number.isFinite(ny) && x !== "" && y !== "" ? ny - nx : y.localeCompare(x);
    if (diff !== 0) return diff;
  }
  return 0;
}
