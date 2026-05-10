/**
 * Conversation identity key (33a).
 *
 * A conversation is the (provider, client) pair across the lifetime
 * of their bookings. We encode it as a single URL-safe string so
 * routes can use it as a path param without exposing two cuids.
 *
 * Format: `<providerId>:<clientUserId>` — both are cuids already
 * URL-safe (lower-case alpha + digits). No base64 to keep it
 * human-readable when debugging.
 *
 * If we ever need to support chat-without-booking (BACKLOG), we'd
 * extend the format with a prefix, e.g. `pre:<providerId>:<phone>`.
 */
export type ConversationKey = {
  providerId: string;
  clientUserId: string;
};

const SEPARATOR = ":";
const CUID_RE = /^[a-z0-9]{8,32}$/i;

export function serializeConversationKey(key: ConversationKey): string {
  if (!CUID_RE.test(key.providerId) || !CUID_RE.test(key.clientUserId)) {
    throw new Error("Invalid conversation key parts");
  }
  return `${key.providerId}${SEPARATOR}${key.clientUserId}`;
}

export function parseConversationKey(raw: string): ConversationKey | null {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(SEPARATOR);
  if (parts.length !== 2) return null;
  const [providerId, clientUserId] = parts;
  if (!providerId || !clientUserId) return null;
  if (!CUID_RE.test(providerId) || !CUID_RE.test(clientUserId)) return null;
  return { providerId, clientUserId };
}
