import { BookingStatus, type Booking } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  OPEN_STATUSES,
  READONLY_WINDOW_HOURS,
  getChatAvailability,
} from "@/lib/chat/status";
import type { ConversationKey } from "@/lib/chat/conversation-slug";

/**
 * Conversation-level access composed from existing per-booking
 * guards (33a).
 *
 * `getChatAvailability` enforces that send/read access is bound to
 * the booking lifecycle — chat is `canSend` only while the booking
 * is in OPEN_STATUSES, and `isReadOnly` for 24h after FINISHED.
 *
 * The conversation view aggregates messages across **all** bookings
 * between a (provider, client) pair, so we have to widen the
 * read-permission slightly:
 *
 *   - canView: user must be a participant in at least one booking of
 *     the pair. History is then read-only for older finished
 *     bookings — UI displays it but compose is disabled.
 *   - canSend: there must exist at least one booking in
 *     OPEN_STATUSES the user participates in (the sender helper
 *     picks the most recent open one as the target chatId).
 *
 * This is a deliberate broadening of read-access for messenger UX.
 * See BACKLOG → "Historical privacy expansion" for the legal/audit
 * trail when the change goes live.
 */
export type ConversationParticipant = "MASTER" | "CLIENT";

export type ConversationAccess =
  | {
      ok: true;
      perspective: ConversationParticipant;
      canSend: boolean;
      openBookingId: string | null;
      readonlyOnly: boolean;
    }
  | { ok: false; reason: "not-found" | "forbidden" };

export async function resolveConversationAccess(input: {
  key: ConversationKey;
  userId: string;
  hintedPerspective?: ConversationParticipant;
}): Promise<ConversationAccess> {
  const { key, userId, hintedPerspective } = input;

  // Find every booking between the pair and detect whether the caller
  // is the master-owner or the client. One round-trip — small payload.
  const bookings = await prisma.booking.findMany({
    where: {
      providerId: key.providerId,
      clientUserId: key.clientUserId,
    },
    orderBy: { startAtUtc: "desc" },
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      clientUserId: true,
      provider: { select: { ownerUserId: true } },
    },
  });

  if (bookings.length === 0) {
    return { ok: false, reason: "not-found" };
  }

  const isClient = bookings.some((b) => b.clientUserId === userId);
  const isMaster = bookings.some((b) => b.provider?.ownerUserId === userId);

  if (!isClient && !isMaster) {
    return { ok: false, reason: "forbidden" };
  }

  // When a perspective is hinted (route source: master vs client cabinet)
  // verify it matches the actual relationship — defence in depth so a
  // master in the master cabinet can't view a thread where they're only
  // the client by some data quirk.
  const perspective: ConversationParticipant = hintedPerspective ?? (isMaster ? "MASTER" : "CLIENT");
  if (hintedPerspective === "MASTER" && !isMaster) {
    return { ok: false, reason: "forbidden" };
  }
  if (hintedPerspective === "CLIENT" && !isClient) {
    return { ok: false, reason: "forbidden" };
  }

  // Find the booking we'd send into — most recent OPEN.
  const openBooking = bookings.find((b) => OPEN_STATUSES.includes(b.status));
  // readonlyOnly = there's a FINISHED booking in the 24h window but
  // nothing currently open. UI uses this to soften the disabled
  // composer ("ваша запись завершена, есть 24ч на финальные сообщения").
  const readonlyOnly =
    !openBooking &&
    bookings.some((b) => {
      const availability = getChatAvailability(b.status, b.startAtUtc);
      return availability.isReadOnly;
    });

  return {
    ok: true,
    perspective,
    canSend: Boolean(openBooking),
    openBookingId: openBooking?.id ?? null,
    readonlyOnly,
  };
}

export type ConversationParticipantBooking = Pick<
  Booking,
  "id" | "status" | "startAtUtc" | "endAtUtc"
>;

/**
 * Convenience helper: surface the readonly-window TTL so the UI can
 * tell the user when chat composition will become unavailable.
 */
export function getReadonlyExpiryUtc(finishedAtUtc: Date): Date {
  return new Date(finishedAtUtc.getTime() + READONLY_WINDOW_HOURS * 3_600_000);
}

export const CONVERSATION_OPEN_STATUSES: BookingStatus[] = OPEN_STATUSES;
