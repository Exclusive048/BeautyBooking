import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Opaque public identifier for a chat conversation pair
 * (`providerId`, `clientUserId`).
 *
 * chat-url-fix: replaces the previous `providerId:clientUserId`
 * serialised key that leaked internal CUIDs into URLs and notification
 * payloads. The slug is **identifier only** — never authorisation.
 * Every route still calls `resolveConversationAccess({ key })` against
 * the resolved pair, so guessing or brute-forcing a slug doesn't grant
 * access. The slug just hides the pair behind a stable opaque handle
 * (10-char base62 ≈ 8×10¹⁷ search space).
 *
 * Slugs are created **lazily** on first conversation access. Existing
 * pairs in `Booking` get a slug the next time the master or client
 * opens the chat — no migration backfill required for the launch.
 */

export type ConversationKey = {
  providerId: string;
  clientUserId: string;
};

const SLUG_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SLUG_LENGTH = 10;
const MAX_COLLISION_RETRIES = 3;
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * 10-char base62 slug from `crypto.randomBytes`. Rejection-sample to
 * keep the alphabet uniform: each byte yields one char only if the
 * byte falls within the largest multiple of 62 below 256 (i.e.
 * `byte < 248`). Otherwise re-roll. Avoids the modulo-bias that a
 * naive `byte % 62` would introduce.
 */
export function generateConversationSlug(): string {
  let out = "";
  while (out.length < SLUG_LENGTH) {
    const buffer = randomBytes(SLUG_LENGTH * 2);
    for (let i = 0; i < buffer.length && out.length < SLUG_LENGTH; i += 1) {
      const byte = buffer[i]!;
      if (byte < 248) {
        out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
      }
    }
  }
  return out;
}

/**
 * Returns the existing slug for the pair, or creates one. Idempotent:
 * same pair always returns the same slug. Collisions on `slug` (rare
 * at 62¹⁰) are retried up to {@link MAX_COLLISION_RETRIES} times by
 * generating a fresh random.
 *
 * Race-safe: if two requests for the same new pair land at once, the
 * loser hits a `P2002` on `(providerId, clientUserId)` and is
 * recovered by re-reading.
 */
export async function getOrCreateConversationSlug(
  key: ConversationKey,
): Promise<string> {
  const existing = await prisma.conversationSlug.findUnique({
    where: {
      providerId_clientUserId: {
        providerId: key.providerId,
        clientUserId: key.clientUserId,
      },
    },
    select: { slug: true },
  });
  if (existing) return existing.slug;

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const slug = generateConversationSlug();
    try {
      const created = await prisma.conversationSlug.create({
        data: {
          slug,
          providerId: key.providerId,
          clientUserId: key.clientUserId,
        },
        select: { slug: true },
      });
      return created.slug;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_VIOLATION
      ) {
        // P2002 could mean either:
        //   - (providerId, clientUserId) was just inserted by a parallel
        //     request → re-read and return the winner's slug.
        //   - slug collision → retry generation.
        const recovered = await prisma.conversationSlug.findUnique({
          where: {
            providerId_clientUserId: {
              providerId: key.providerId,
              clientUserId: key.clientUserId,
            },
          },
          select: { slug: true },
        });
        if (recovered) return recovered.slug;
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to allocate unique conversation slug");
}

/**
 * Resolves a slug to its underlying pair. Returns `null` when the slug
 * does not exist — callers should map that to 404. Existence does
 * **not** imply access; callers must still invoke
 * `resolveConversationAccess` against the returned key.
 */
export async function resolveConversationSlug(
  slug: string,
): Promise<ConversationKey | null> {
  if (!slug || typeof slug !== "string") return null;
  if (slug.length !== SLUG_LENGTH) return null;
  const record = await prisma.conversationSlug.findUnique({
    where: { slug },
    select: { providerId: true, clientUserId: true },
  });
  return record
    ? { providerId: record.providerId, clientUserId: record.clientUserId }
    : null;
}
