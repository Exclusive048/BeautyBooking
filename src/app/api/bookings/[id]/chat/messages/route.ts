import type { NextRequest } from "next/server";
import { z } from "zod";
import { NotificationType } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { resolveChatAccess } from "@/lib/chat/access";
import {
  markAttachmentUsed,
  validateChatAttachmentAsset,
} from "@/lib/chat/attachment";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";
import { deliverNotification } from "@/lib/notifications/delivery";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    // CHAT-FOUNDATION-A-MIGRATION: body OR attachment required.
    body: z.string().trim().max(1000).optional().default(""),
    attachmentMediaAssetId: z.string().trim().min(1).nullable().optional(),
  })
  .refine(
    (value) => (value.body && value.body.length > 0) || Boolean(value.attachmentMediaAssetId),
    { message: "Сообщение пустое.", path: ["body"] },
  );

function resolveUserName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  fallback: string;
}): string {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  const parts = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  const phone = input.phone?.trim();
  if (phone) return phone;
  return input.fallback;
}

function previewBody(body: string): string {
  return body.length > 80 ? body.slice(0, 80) : body;
}

type RouteParams = Promise<Record<string, string>>;

export async function POST(req: NextRequest, ctx: { params: RouteParams }) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const params = await ctx.params;
    const bookingId = params.id;

    const access = await resolveChatAccess(bookingId, user.userId);
    if (!access.ok) {
      if (access.reason === "not-found") return jsonFail(404, "Booking not found", "NOT_FOUND");
      if (access.reason === "forbidden") return jsonFail(403, "Forbidden", "FORBIDDEN");
      return jsonFail(403, "Chat is closed", "FORBIDDEN");
    }

    if (!access.availability.canSend) {
      return jsonFail(403, "Chat is closed", "FORBIDDEN");
    }

    const body = await parseBody(req, bodySchema);

    const chat = await prisma.bookingChat.upsert({
      where: { bookingId },
      create: { bookingId },
      update: {},
      select: { id: true },
    });

    const senderName = await (async () => {
      if (access.senderType === "MASTER") {
        return access.booking.masterProvider?.name?.trim() || "Мастер";
      }
      const profile = await prisma.userProfile.findUnique({
        where: { id: user.userId },
        select: { displayName: true, firstName: true, lastName: true, phone: true },
      });
      return resolveUserName({
        displayName: profile?.displayName,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        phone: profile?.phone,
        fallback: "Клиент",
      });
    })();

    // CHAT-FOUNDATION-A-MIGRATION: validate attachment before persist.
    const attachmentMediaAssetId = body.attachmentMediaAssetId ?? null;
    if (attachmentMediaAssetId) {
      await validateChatAttachmentAsset({
        assetId: attachmentMediaAssetId,
        senderUserId: user.userId,
      });
    }

    const message = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderType: access.senderType,
        senderName,
        body: body.body,
        attachmentMediaAssetId,
      },
      select: {
        id: true,
        senderType: true,
        senderName: true,
        body: true,
        readAt: true,
        createdAt: true,
        attachmentMediaAssetId: true,
      },
    });

    if (attachmentMediaAssetId) {
      await markAttachmentUsed({ assetId: attachmentMediaAssetId, messageId: message.id });
    }

    const recipientUserId =
      access.senderType === "CLIENT"
        ? access.booking.masterProvider?.ownerUserId ?? null
        : access.booking.clientUserId;

    if (recipientUserId) {
      const bodyPreview = previewBody(message.body);
      const title = `Сообщение от ${senderName}`;
      const payload = {
        bookingId,
        chatId: chat.id,
        messageId: message.id,
        senderType: access.senderType,
        senderName,
        bodyPreview,
      };
      await deliverNotification({
        userId: recipientUserId,
        type: NotificationType.CHAT_MESSAGE_RECEIVED,
        title,
        body: bodyPreview,
        payloadJson: payload,
        pushUrl:
          access.senderType === "CLIENT"
            ? `/cabinet/master/dashboard?bookingId=${bookingId}&chat=open`
            : `/cabinet/bookings?bookingId=${bookingId}&chat=open`,
      });
    }

    return jsonOk({ message }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/bookings/[bookingId]/chat/messages failed", {
        requestId,
        route: "POST /api/bookings/{bookingId}/chat/messages",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
