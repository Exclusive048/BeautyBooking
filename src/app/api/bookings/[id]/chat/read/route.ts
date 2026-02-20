import type { NextRequest } from "next/server";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { resolveChatAccess } from "@/lib/chat/access";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

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
      return jsonFail(409, "Chat unavailable", "CONFLICT");
    }

    const chat = await prisma.bookingChat.upsert({
      where: { bookingId },
      create: { bookingId },
      update: {},
      select: { id: true },
    });

    const updated = await prisma.chatMessage.updateMany({
      where: {
        chatId: chat.id,
        readAt: null,
        senderType: { not: access.senderType },
      },
      data: { readAt: new Date() },
    });

    return jsonOk({ markedCount: updated.count });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/bookings/[bookingId]/chat/read failed", {
        requestId,
        route: "POST /api/bookings/{bookingId}/chat/read",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
