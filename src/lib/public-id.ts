/**
 * Opaque public id encoding (RULE-12-REMAINDER, FIX-15).
 *
 * Rule 12 forbids returning raw internal CUIDs in public API responses. For
 * entities that have no `publicUsername`/`publicCode` (portfolio items, story
 * items) and whose id drives a read/mutation route, we expose an opaque,
 * URL-safe token instead of the raw id — the same base64url idea as the
 * pagination `encodeCursor`. The consuming route decodes it back server-side.
 *
 * Tokens carry a short `e_` prefix so {@link decodePublicId} can tell an
 * encoded token from a raw id and stay **backward-compatible**: any path still
 * passing a raw CUID (e.g. an old bookmarked URL) resolves unchanged. The
 * encoding is reversible (not a secret) — its job is to keep raw ids out of
 * public payloads + decouple public URLs from the storage id, exactly like a
 * cursor.
 *
 * Pure (Buffer only) — safe to import from client or server.
 */
const ENCODED_PREFIX = "e_";

export function encodePublicId(id: string): string {
  return ENCODED_PREFIX + Buffer.from(id, "utf-8").toString("base64url");
}

export function decodePublicId(token: string): string {
  if (!token.startsWith(ENCODED_PREFIX)) {
    return token; // raw id — backward-compatible
  }
  const decoded = Buffer.from(token.slice(ENCODED_PREFIX.length), "base64url").toString("utf-8");
  return decoded || token;
}
