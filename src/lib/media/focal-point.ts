/**
 * Convert focal point coords to CSS object-position value.
 *
 * @param focalX - 0.0 (left) to 1.0 (right), null/undefined -> 0.5
 * @param focalY - 0.0 (top) to 1.0 (bottom), null/undefined -> 0.5
 */
export function focalPointToObjectPosition(
  focalX: number | null | undefined,
  focalY: number | null | undefined
): string {
  const x = typeof focalX === "number" ? focalX : 0.5;
  const y = typeof focalY === "number" ? focalY : 0.5;
  return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
}
