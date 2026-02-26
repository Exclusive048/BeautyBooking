import { prisma } from "@/lib/prisma";
import { getAppPublicUrl } from "@/lib/telegram/config";
import { logError } from "@/lib/logging/logger";
import { getTelegramChatIdForUser } from "@/lib/notifications/recipients";
import { enqueue } from "@/lib/queue/queue";
import { createTelegramSendJob } from "@/lib/queue/types";
import {
  buildBookingCancelledText,
  buildBookingConfirmedText,
  buildClientBookingCreatedText,
  buildBookingCreatedText,
  buildBookingReminderText,
} from "@/lib/notifications/bookingTelegram";
import type { BookingReminderKind } from "@/lib/queue/types";

type BookingTelegramKind = "CREATED" | "CANCELLED" | "CONFIRMED";

type BookingTelegramNotifyOptions = {
  notifyClientOnCreate?: boolean;
  notifyMasterOnConfirm?: boolean;
  notifyClientOnCancel?: boolean;
  notifyMasterOnCancel?: boolean;
};

type BookingAnswerEntry = {
  questionText: string;
  answer: string;
};

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
  referencePhotoUrl: string | null;
  bookingAnswers: BookingAnswerEntry[];
};

const DEFAULT_OPTIONS: Required<BookingTelegramNotifyOptions> = {
  notifyClientOnCreate: true,
  notifyMasterOnConfirm: false,
  notifyClientOnCancel: true,
  notifyMasterOnCancel: true,
};

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatDateTimeUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeBookingAnswers(value: unknown): BookingAnswerEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const questionText = typeof record.questionText === "string" ? record.questionText.trim() : "";
      const answer = typeof record.answer === "string" ? record.answer.trim() : "";
      if (!questionText || !answer) return null;
      return { questionText, answer };
    })
    .filter((item): item is BookingAnswerEntry => item !== null);
}

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
      provider: { select: { name: true, ownerUserId: true } },
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
  const whenText = booking.startAtUtc
    ? formatDateTimeUtc(booking.startAtUtc)
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
    referencePhotoUrl: booking.referencePhotoAssetId
      ? `${appUrl}/api/media/file/${booking.referencePhotoAssetId}`
      : null,
    bookingAnswers: normalizeBookingAnswers(booking.bookingAnswers),
  };
}

export async function sendBookingTelegramNotifications(
  bookingId: string,
  kind: BookingTelegramKind,
  options: BookingTelegramNotifyOptions = {}
): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx) return;

  const config = { ...DEFAULT_OPTIONS, ...options };

  try {
    const masterChatId = ctx.masterUserId ? await getTelegramChatIdForUser(ctx.masterUserId) : null;
    const clientChatId = ctx.clientUserId ? await getTelegramChatIdForUser(ctx.clientUserId) : null;

    if (kind === "CREATED") {
      if (masterChatId) {
        const text = buildBookingCreatedText({
          serviceName: ctx.serviceName,
          whenText: ctx.whenText,
          clientName: ctx.clientName,
          clientPhone: ctx.clientPhone,
          linkUrl: ctx.masterUrl,
          referencePhotoUrl: ctx.referencePhotoUrl,
          bookingAnswers: ctx.bookingAnswers,
        });
        await enqueueTelegramSend(masterChatId, text);
      }
      if (config.notifyClientOnCreate && clientChatId) {
        const text = buildClientBookingCreatedText({
          serviceName: ctx.serviceName,
          whenText: ctx.whenText,
          linkUrl: ctx.clientUrl,
        });
        await enqueueTelegramSend(clientChatId, text);
      }
      return;
    }

    if (kind === "CANCELLED") {
      if (config.notifyMasterOnCancel && masterChatId) {
        const text = buildBookingCancelledText({
          serviceName: ctx.serviceName,
          whenText: ctx.whenText,
          linkUrl: ctx.masterUrl,
        });
        await enqueueTelegramSend(masterChatId, text);
      }
      if (config.notifyClientOnCancel && clientChatId) {
        const text = buildBookingCancelledText({
          serviceName: ctx.serviceName,
          whenText: ctx.whenText,
          linkUrl: ctx.clientUrl,
        });
        await enqueueTelegramSend(clientChatId, text);
      }
      return;
    }

    if (kind === "CONFIRMED") {
      if (clientChatId) {
        const text = buildBookingConfirmedText({
          serviceName: ctx.serviceName,
          whenText: ctx.whenText,
          masterName: ctx.masterName,
          linkUrl: ctx.clientUrl,
        });
        await enqueueTelegramSend(clientChatId, text);
      }
      if (config.notifyMasterOnConfirm && masterChatId) {
        const text = buildBookingConfirmedText({
          serviceName: ctx.serviceName,
          whenText: ctx.whenText,
          masterName: ctx.masterName,
          linkUrl: ctx.masterUrl,
        });
        await enqueueTelegramSend(masterChatId, text);
      }
    }
  } catch (error) {
    logError("Failed to send booking telegram notifications", {
      bookingId,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
