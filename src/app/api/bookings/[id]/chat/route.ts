import type { NextRequest } from "next/server";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { resolveChatAccess } from "@/lib/chat/access";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logging/logger";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

type RouteParams = Promise<Record<string, string>>;

const messageSelect = {
  id: true,
  senderType: true,
  senderName: true,
  body: true,
  readAt: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest, ctx: { params: RouteParams }) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const params = await ctx.params;
    const bookingId = params.id;

    const access = await resolveChatAccess(bookingId, user.userId);
    if (!access.ok) {
      if (access.reason === "not-found") {
        return jsonFail(404, "Booking not found", "NOT_FOUND");
      }
      if (access.reason === "forbidden") {
        return jsonFail(403, "Forbidden", "FORBIDDEN");
      }
      return jsonFail(409, "Chat unavailable", "CONFLICT");
    }

    let chat = await prisma.bookingChat.findUnique({
      where: { bookingId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: messageSelect,
        },
      },
    });

    if (!chat) {
      try {
        chat = await prisma.bookingChat.create({
          data: { bookingId },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              select: messageSelect,
            },
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          chat = await prisma.bookingChat.findUnique({
            where: { bookingId },
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
                select: messageSelect,
              },
            },
          });
        } else {
          throw error;
        }
      }
    }

    if (!chat) {
      return jsonFail(404, "Chat not found", "NOT_FOUND");
    }

    const unreadCount = await prisma.chatMessage.count({
      where: {
        chatId: chat.id,
        readAt: null,
        senderType: { not: access.senderType },
      },
    });

    return jsonOk({
      chatId: chat.id,
      isOpen: access.availability.canSend,
      isReadOnly: access.availability.isReadOnly,
      messages: chat.messages,
      unreadCount,
    });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/bookings/[bookingId]/chat failed", {
        requestId,
        route: "GET /api/bookings/{bookingId}/chat",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
