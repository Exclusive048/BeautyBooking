import { prisma } from "@/lib/prisma";
import { getAppPublicUrl } from "@/lib/telegram/config";
import { logError } from "@/lib/logging/logger";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";
import { enqueue } from "@/lib/queue/queue";
import { createTelegramSendJob } from "@/lib/queue/types";
import { buildBookingReminderText } from "@/lib/notifications/bookingTelegram";
import { formatBookingWhenLabel } from "@/lib/notifications/format-booking-when";
import type { BookingReminderKind } from "@/lib/queue/types";

// HARDENING-09: the CREATED/CANCELLED/CONFIRMED lifecycle Telegram sender
// (`sendBookingTelegramNotifications`) was removed — it had ZERO callers in
// `src/` (the live lifecycle path is in-app `booking-notifications.ts`). Only
// the reminder path below is wired (reminders.ts → worker). Its "when" line now
// renders in the SALON timezone with an explicit zone label, matching the in-app
// path via the shared `formatBookingWhenLabel` (was raw-UTC `getUTCHours` → a
// 13:00 Yekaterinburg booking showed as 08:00; masked only by the kill-switch).

type BookingTelegramContext = {
  serviceName: string;
  whenText: string | null;
  clientName: string | null;
  clientPhone: string | null;
  masterName: string | null;
  masterUrl: string;
  clientUrl: string;
  masterUserId: string | null;
  clientUserId: string | null;
};

async function enqueueTelegramSend(chatId: string, text: string): Promise<void> {
  await enqueue(
    createTelegramSendJob({
      chatId,
      text,
    })
  );
}

async function loadBookingContext(bookingId: string): Promise<BookingTelegramContext | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true } },
      provider: { select: { name: true, ownerUserId: true, timezone: true } },
      masterProvider: { select: { name: true, ownerUserId: true } },
    },
  });

  if (!booking) return null;

  const appUrl = getAppPublicUrl();
  if (!appUrl) {
    logError("APP_PUBLIC_URL is not configured", { route: "booking-telegram" });
    return null;
  }

  const masterUserId = booking.masterProvider?.ownerUserId ?? booking.provider.ownerUserId ?? null;
  // Salon-tz display (rule 8 + SKILL-TZ). Mirrors the in-app lifecycle path.
  const whenText = booking.startAtUtc
    ? formatBookingWhenLabel(booking.startAtUtc, booking.provider.timezone)
    : booking.slotLabel || null;

  return {
    serviceName: booking.service.name,
    whenText,
    clientName: booking.clientName ?? null,
    clientPhone: booking.clientPhone ?? null,
    masterName: booking.masterProvider?.name ?? booking.provider.name ?? null,
    masterUrl: `${appUrl}/cabinet/master`,
    clientUrl: `${appUrl}/cabinet/profile`,
    masterUserId,
    clientUserId: booking.clientUserId ?? null,
  };
}

export async function sendBookingReminderTelegramNotifications(
  bookingId: string,
  kind: BookingReminderKind
): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx) return;

  try {
    const masterChatId = ctx.masterUserId ? await getTelegramChatIdForUser(ctx.masterUserId) : null;
    const clientChatId = ctx.clientUserId ? await getTelegramChatIdForUser(ctx.clientUserId) : null;

    if (masterChatId) {
      const text = buildBookingReminderText({
        kind,
        serviceName: ctx.serviceName,
        whenText: ctx.whenText,
        clientName: ctx.clientName,
        clientPhone: ctx.clientPhone,
        masterName: ctx.masterName,
        linkUrl: ctx.masterUrl,
      });
      await enqueueTelegramSend(masterChatId, text);
    }

    if (clientChatId) {
      const text = buildBookingReminderText({
        kind,
        serviceName: ctx.serviceName,
        whenText: ctx.whenText,
        clientName: ctx.clientName,
        clientPhone: ctx.clientPhone,
        masterName: ctx.masterName,
        linkUrl: ctx.clientUrl,
      });
      await enqueueTelegramSend(clientChatId, text);
    }
  } catch (error) {
    logError("Failed to send booking reminder telegram notifications", {
      bookingId,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
