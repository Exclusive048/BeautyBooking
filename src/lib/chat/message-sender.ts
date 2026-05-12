import { ChatSenderType, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { deliverNotification } from "@/lib/notifications/delivery";
import { resolveConversationAccess } from "@/lib/chat/conversation-access";
import {
  getOrCreateConversationSlug,
  resolveConversationSlug,
  type ConversationKey,
} from "@/lib/chat/conversation-slug";
import type { ConversationParticipant } from "@/lib/chat/conversation-access";

const MAX_BODY_LENGTH = 1000;

/**
 * Send a message in a conversation (33a, slug-aware after
 * chat-url-fix).
 *
 * Reuses the existing per-booking send semantics: we resolve the
 * conversation's open booking (CONFIRMED | PREPAID | STARTED |
 * IN_PROGRESS), upsert its `BookingChat`, and insert a
 * `ChatMessage`. The legacy `/api/bookings/[id]/chat/messages`
 * endpoint stays alongside for back-compat (booking-detail drawer).
 *
 * Notification delivery uses the existing CHAT_MESSAGE_RECEIVED
 * flow — so SSE/push/telegram all keep working without changes.
 * Payload carries `conversationSlug` (was: `conversationKey`); the
 * pushUrl uses the slug form `/cabinet/master/messages?c=<slug>` so
 * neither URL nor notification leaks internal cuids.
 */
export type SendMessageInput = {
  /** Opaque conversation slug from the route param. */
  slug: string;
  perspective: ConversationParticipant;
  userId: string;
  body: string;
};

export type SendMessageResult = {
  message: {
    id: string;
    senderType: ChatSenderType;
    senderName: string;
    body: string;
    readAt: string | null;
    createdAt: string;
    bookingId: string;
  };
  conversationSlug: string;
};

function deriveSenderName(input: {
  perspective: ConversationParticipant;
  providerName?: string | null;
  userDisplayName?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
  userPhone?: string | null;
}): string {
  if (input.perspective === "MASTER") {
    return input.providerName?.trim() || "Мастер";
  }
  const dn = input.userDisplayName?.trim();
  if (dn) return dn;
  const combo = [input.userFirstName, input.userLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (combo) return combo;
  if (input.userPhone) return input.userPhone;
  return "Клиент";
}

function previewBody(body: string): string {
  return body.length > 80 ? `${body.slice(0, 80)}…` : body;
}

export async function sendConversationMessage(
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const key = await resolveConversationSlug(input.slug);
  if (!key) {
    throw new AppError("Переписка не найдена.", 404, "NOT_FOUND");
  }

  const body = input.body.trim();
  if (!body) {
    throw new AppError("Сообщение пустое.", 400, "VALIDATION_ERROR");
  }
  if (body.length > MAX_BODY_LENGTH) {
    throw new AppError("Сообщение слишком длинное.", 400, "VALIDATION_ERROR");
  }

  const access = await resolveConversationAccess({
    key,
    userId: input.userId,
    hintedPerspective: input.perspective,
  });
  if (!access.ok) {
    if (access.reason === "not-found") {
      throw new AppError("Переписка не найдена.", 404, "NOT_FOUND");
    }
    throw new AppError("Доступ запрещён.", 403, "FORBIDDEN");
  }
  if (!access.canSend || !access.openBookingId) {
    throw new AppError(
      "Чтобы отправить сообщение, у вас должна быть активная запись.",
      403,
      "FORBIDDEN",
    );
  }

  // Re-fetch the open booking with the data we need for sender naming.
  const booking = await prisma.booking.findUnique({
    where: { id: access.openBookingId },
    select: {
      id: true,
      clientUserId: true,
      provider: { select: { id: true, name: true, ownerUserId: true } },
    },
  });
  if (!booking) {
    throw new AppError("Запись не найдена.", 404, "NOT_FOUND");
  }

  const senderType: ChatSenderType =
    input.perspective === "MASTER" ? ChatSenderType.MASTER : ChatSenderType.CLIENT;

  const recipientUserId =
    senderType === ChatSenderType.MASTER ? booking.clientUserId : booking.provider.ownerUserId;

  // Sender name uses the same logic as the existing per-booking route
  // — snapshotted into ChatMessage.senderName.
  let senderName: string;
  if (senderType === ChatSenderType.MASTER) {
    senderName = booking.provider.name?.trim() || "Мастер";
  } else {
    const profile = await prisma.userProfile.findUnique({
      where: { id: input.userId },
      select: { displayName: true, firstName: true, lastName: true, phone: true },
    });
    senderName = deriveSenderName({
      perspective: input.perspective,
      userDisplayName: profile?.displayName,
      userFirstName: profile?.firstName,
      userLastName: profile?.lastName,
      userPhone: profile?.phone,
    });
  }

  const chat = await prisma.bookingChat.upsert({
    where: { bookingId: booking.id },
    create: { bookingId: booking.id },
    update: {},
    select: { id: true },
  });

  const message = await prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      senderType,
      senderName,
      body,
    },
    select: {
      id: true,
      senderType: true,
      senderName: true,
      body: true,
      readAt: true,
      createdAt: true,
    },
  });

  // Notify the other side via the existing CHAT_MESSAGE_RECEIVED
  // path — SSE + push + telegram all still work. Conversation-aware
  // routing: payload carries the conversationSlug so receivers can
  // open the right thread in the new chat surface, plus the
  // bookingId for the legacy <BookingChat> in booking detail.
  if (recipientUserId) {
    // Reuse the slug for the same pair when notifying the recipient —
    // it's the same conversation regardless of perspective.
    const conversationSlug = await getOrCreateConversationSlug(key);
    const preview = previewBody(message.body);
    const recipientPath: string =
      senderType === ChatSenderType.CLIENT
        ? `/cabinet/master/messages?c=${encodeURIComponent(conversationSlug)}`
        : `/cabinet/messages?c=${encodeURIComponent(conversationSlug)}`;
    await deliverNotification({
      userId: recipientUserId,
      type: NotificationType.CHAT_MESSAGE_RECEIVED,
      title: `Сообщение от ${senderName}`,
      body: preview,
      payloadJson: {
        bookingId: booking.id,
        chatId: chat.id,
        messageId: message.id,
        conversationSlug,
        senderType,
        senderName,
        bodyPreview: preview,
      } satisfies Prisma.InputJsonValue,
      pushUrl: recipientPath,
    });
  }

  return {
    message: {
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      body: message.body,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
      bookingId: booking.id,
    },
    conversationSlug: input.slug,
  };
}

export type { ConversationKey };
