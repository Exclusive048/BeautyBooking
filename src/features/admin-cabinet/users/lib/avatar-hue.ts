/**
 * Deterministic 0–360 hue derived from a user id (CUID). Same id always
 * yields the same hue, so a user's avatar gradient stays stable across
 * page reloads and admin sessions.
 *
 * djb2-style hash — chosen for speed + reasonable distribution; we
 * don't care about cryptographic properties here.
 */
export function getAvatarHue(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0; // force int32
  }
  return Math.abs(hash) % 360;
}

/** First letter of first + last token. Falls back to "?" for an empty
 * / whitespace-only name. */
export function initialsFromName(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  const first = tokens[0]!.charAt(0);
  const last = tokens.length > 1 ? tokens[tokens.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}
