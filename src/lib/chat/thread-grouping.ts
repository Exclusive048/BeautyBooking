/**
 * Inject day separators into a flat message list (33a).
 *
 * Pure function — no timezone deps from the engine here; the caller
 * already formats labels in the viewer's locale. We just decide
 * where breaks belong (different YYYY-MM-DD vs previous message).
 */
import type { ChatSenderType } from "@prisma/client";

/** Booking snapshot attached to a system message that pins a card. */
export type ThreadBookingCard = {
  id: string;
  status: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  serviceName: string;
  priceSnapshot: number;
  durationMin: number;
  address: string | null;
};

export type ThreadMessage = {
  type: "message";
  id: string;
  senderType: ChatSenderType;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  bookingId: string;
  /** Booking referenced by a SYSTEM message (lifecycle card). Null otherwise. */
  bookingCard: ThreadBookingCard | null;
};

export type ThreadDaySeparator = {
  type: "day_separator";
  id: string;
  /** ISO date key (YYYY-MM-DD in viewer timezone) — UI formats label. */
  dateKey: string;
};

export type ThreadItem = ThreadMessage | ThreadDaySeparator;

type RawMessage = {
  id: string;
  senderType: ChatSenderType;
  senderName: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  bookingId: string;
  bookingCard?: ThreadBookingCard | null;
};

export function injectDaySeparators(
  messages: RawMessage[],
  timezone: string,
): ThreadItem[] {
  const out: ThreadItem[] = [];
  let lastKey: string | null = null;
  for (const message of messages) {
    const key = toDateKey(message.createdAt, timezone);
    if (key !== lastKey) {
      out.push({
        type: "day_separator",
        id: `day-${key}`,
        dateKey: key,
      });
      lastKey = key;
    }
    out.push({
      type: "message",
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      body: message.body,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
      bookingId: message.bookingId,
      bookingCard: message.bookingCard ?? null,
    });
  }
  return out;
}

function toDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(date);
  return parts; // en-CA → YYYY-MM-DD
}
