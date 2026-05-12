import type { NextRequest } from "next/server";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/access";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { resolveConversationSlug } from "@/lib/chat/conversation-slug";
import { resolveConversationAccess } from "@/lib/chat/conversation-access";
import { markConversationRead } from "@/lib/chat/conversation-aggregator";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteParams = Promise<{ slug: string }>;

export async function POST(
  req: NextRequest,
  ctx: { params: RouteParams },
) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const params = await ctx.params;
    const slug = decodeURIComponent(params.slug);

    const key = await resolveConversationSlug(slug);
    if (!key) {
      return jsonFail(404, "Переписка не найдена.", "NOT_FOUND");
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

    const count = await markConversationRead({ key, perspective });
    return jsonOk({ markedCount: count });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/chat/threads/[slug]/read failed", {
        requestId,
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
