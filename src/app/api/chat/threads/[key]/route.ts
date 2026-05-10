import type { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/access";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { parseConversationKey } from "@/lib/chat/conversation-key";
import { resolveConversationAccess } from "@/lib/chat/conversation-access";
import { getConversationThread } from "@/lib/chat/conversation-aggregator";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteParams = Promise<{ key: string }>;

export async function GET(
  req: NextRequest,
  ctx: { params: RouteParams },
) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const params = await ctx.params;
    const key = parseConversationKey(decodeURIComponent(params.key));
    if (!key) {
      return jsonFail(400, "Некорректная переписка.", "VALIDATION_ERROR");
    }

    const url = new URL(req.url);
    const asParam = url.searchParams.get("as");
    const isMaster = user.roles.includes(AccountType.MASTER);
    const perspective =
      asParam === "client" ? "CLIENT" : asParam === "master" ? "MASTER" : isMaster ? "MASTER" : "CLIENT";

    const access = await resolveConversationAccess({
      key,
      userId: user.userId,
      hintedPerspective: perspective,
    });
    if (!access.ok) {
      return jsonFail(
        access.reason === "not-found" ? 404 : 403,
        access.reason === "not-found" ? "Переписка не найдена." : "Доступ запрещён.",
        access.reason === "not-found" ? "NOT_FOUND" : "FORBIDDEN",
      );
    }

    const tzHint = req.headers.get("x-tz") ?? undefined;

    const detail = await getConversationThread({
      key,
      perspective,
      viewerTimezone: tzHint || "Europe/Moscow",
    });
    if (!detail) {
      return jsonFail(404, "Переписка не найдена.", "NOT_FOUND");
    }

    return jsonOk({
      thread: detail.thread,
      partner: detail.partner,
      perspective,
      canSend: access.canSend,
      openBookingId: access.openBookingId,
      readonlyOnly: access.readonlyOnly,
      timezone: detail.timezone,
    });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/chat/threads/[key] failed", {
        requestId,
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
