/**
 * Deterministic hue (0–359) for a string identifier — used to colorize
 * gradient placeholders for masters who don't have portfolio photos yet.
 * Same id → same hue across renders, so the catalog stays visually stable
 * between page loads.
 */
export function hueFromId(id: string): number {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}
