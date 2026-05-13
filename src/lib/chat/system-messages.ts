import { ChatSenderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * System messages live in the regular ChatMessage stream with
 * `senderType=SYSTEM`. They pin a Booking via `referencedBookingId` so the
 * thread can render a card on top of the system notification text.
 *
 * Idempotency is enforced at the database level via
 * `@@unique([referencedBookingId, systemEventKey])` — emit-once per
 * (booking × event) survives webhook retries or duplicate lifecycle
 * triggers. We swallow the unique-constraint error and report "skipped".
 */

export type SystemEventKey =
  | "BOOKING_CREATED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED_BY_CLIENT"
  | "BOOKING_CANCELLED_BY_MASTER";

const SYSTEM_SENDER_NAME = "Система";

async function ensureBookingChatId(bookingId: string): Promise<string> {
  const chat = await prisma.bookingChat.upsert({
    where: { bookingId },
    create: { bookingId },
    update: {},
    select: { id: true },
  });
  return chat.id;
}

export async function emitBookingSystemMessage(args: {
  bookingId: string;
  eventKey: SystemEventKey;
  body: string;
}): Promise<{ created: boolean }> {
  const chatId = await ensureBookingChatId(args.bookingId);

  try {
    await prisma.chatMessage.create({
      data: {
        chatId,
        senderType: ChatSenderType.SYSTEM,
        senderName: SYSTEM_SENDER_NAME,
        body: args.body,
        referencedBookingId: args.bookingId,
        systemEventKey: args.eventKey,
      },
      select: { id: true },
    });
    return { created: true };
  } catch (error) {
    // Unique constraint on (referencedBookingId, systemEventKey) → already emitted.
    // P2002 is Prisma's unique-violation code.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { created: false };
    }
    throw error;
  }
}

function formatLocal(date: Date | null, timezone: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export async function emitBookingCreatedSystemMessage(
  bookingId: string,
): Promise<void> {
  await emitBookingSystemMessage({
    bookingId,
    eventKey: "BOOKING_CREATED",
    body: "Запись создана",
  });
}

export async function emitBookingConfirmedSystemMessage(
  bookingId: string,
): Promise<void> {
  await emitBookingSystemMessage({
    bookingId,
    eventKey: "BOOKING_CONFIRMED",
    body: "Запись подтверждена",
  });
}

export async function emitBookingRescheduledSystemMessage(args: {
  bookingId: string;
  oldStart: Date | null;
  newStart: Date | null;
  timezone: string;
}): Promise<void> {
  const oldLabel = formatLocal(args.oldStart, args.timezone);
  const newLabel = formatLocal(args.newStart, args.timezone);
  await emitBookingSystemMessage({
    bookingId: args.bookingId,
    eventKey: "BOOKING_RESCHEDULED",
    body: `Запись перенесена с ${oldLabel} на ${newLabel}`,
  });
}

export async function emitBookingCancelledSystemMessage(args: {
  bookingId: string;
  by: "CLIENT" | "MASTER";
}): Promise<void> {
  await emitBookingSystemMessage({
    bookingId: args.bookingId,
    eventKey:
      args.by === "CLIENT" ? "BOOKING_CANCELLED_BY_CLIENT" : "BOOKING_CANCELLED_BY_MASTER",
    body:
      args.by === "CLIENT" ? "Клиент отменил запись" : "Мастер отменил запись",
  });
}
