import type { NextRequest } from "next/server";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { resolveChatAccess } from "@/lib/chat/access";
import { CHAT_THREAD_PAGE_SIZE } from "@/lib/chat/conversation-window";
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
  // CHAT-FOUNDATION-A-MIGRATION: surface the optional attachment id
  // for the client renderer. Keeping the select minimal (id only) —
  // the URL/dimensions are looked up separately via the existing
  // media-delivery path when the UI actually needs to render.
  attachmentMediaAssetId: true,
} as const;

/**
 * CHAT-MESSAGES-TAKE: чат записи читается последними
 * `CHAT_THREAD_PAGE_SIZE` сообщениями — тем же потолком, что первая страница
 * переписки пары (`conversation-window.ts`). Раньше `messages` шёл без `take`,
 * и каждый опрос (клиент перечитывает чат после каждой отправки) тянул всю
 * историю. Берём самые новые (`desc` + `take`) и разворачиваем в
 * хронологический порядок ответа; на одно сообщение больше потолка —
 * признак `hasOlderMessages` (более ранняя переписка — в мессенджере).
 */
const chatInclude = {
  messages: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CHAT_THREAD_PAGE_SIZE + 1,
    select: messageSelect,
  },
} satisfies Prisma.BookingChatInclude;

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
        return jsonFail(404, "Запись не найдена.", "NOT_FOUND");
      }
      if (access.reason === "forbidden") {
        return jsonFail(403, "Недостаточно прав для этого действия.", "FORBIDDEN");
      }
      return jsonFail(409, "Чат недоступен.", "CONFLICT");
    }

    let chat = await prisma.bookingChat.findUnique({
      where: { bookingId },
      include: chatInclude,
    });

    if (!chat) {
      try {
        chat = await prisma.bookingChat.create({
          data: { bookingId },
          include: chatInclude,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          chat = await prisma.bookingChat.findUnique({
            where: { bookingId },
            include: chatInclude,
          });
        } else {
          throw error;
        }
      }
    }

    if (!chat) {
      return jsonFail(404, "Чат не найден.", "NOT_FOUND");
    }

    const unreadCount = await prisma.chatMessage.count({
      where: {
        chatId: chat.id,
        readAt: null,
        senderType: { not: access.senderType },
      },
    });

    const hasOlderMessages = chat.messages.length > CHAT_THREAD_PAGE_SIZE;
    const messages = chat.messages.slice(0, CHAT_THREAD_PAGE_SIZE).reverse();

    return jsonOk({
      chatId: chat.id,
      isOpen: access.availability.canSend,
      isReadOnly: access.availability.isReadOnly,
      messages,
      hasOlderMessages,
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
