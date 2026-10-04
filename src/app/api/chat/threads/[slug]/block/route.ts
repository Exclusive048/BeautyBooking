import type { NextRequest } from "next/server";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import {
  blockConversationCounterpart,
  chatBlockReason,
  unblockConversationCounterpart,
  type ChatBlockState,
} from "@/lib/chat/blocks";
import { resolveConversationSlug } from "@/lib/chat/conversation-slug";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";

export const runtime = "nodejs";

type RouteParams = Promise<{ slug: string }>;

/** Блок/разблок — редкое действие: 30 в час на пользователя (общий бюджет POST и DELETE). */
const RATE_LIMIT = { maxRequests: 30, windowSeconds: 3600 };

function toResponse(state: ChatBlockState) {
  return jsonOk({
    blockedByMe: state.blockedByMe,
    blockedByOther: state.blockedByOther,
    blockedReason: chatBlockReason(state),
  });
}

/**
 * MOBILE-POLISH (App Store 1.2) — заблокировать собеседника переписки (POST)
 * или снять свой блок (DELETE). Блок — на уровне людей (клиент ↔ владелец
 * кабинета мастера): закрывает отправку в обе стороны во всех их переписках,
 * записи не трогает. Оба метода идемпотентны и отвечают состоянием
 * `{ blockedByMe, blockedByOther, blockedReason }`. Только участник переписки
 * (иначе 404/403, как у `GET /api/chat/threads/{slug}`).
 */
async function handle(req: NextRequest, ctx: { params: RouteParams }, action: "block" | "unblock") {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;

    const refusal = resolveRateLimitRefusal(
      await checkRateLimit(routeRateLimitKey(req, "user", user.userId), RATE_LIMIT),
    );
    if (refusal) {
      return jsonFail(refusal.status, refusal.message, refusal.code);
    }

    const slug = decodeURIComponent((await ctx.params).slug);
    const key = await resolveConversationSlug(slug);
    const state =
      action === "block"
        ? await blockConversationCounterpart({ key, userId: user.userId })
        : await unblockConversationCounterpart({ key, userId: user.userId });
    return toResponse(state);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError(`${req.method} /api/chat/threads/[slug]/block failed`, {
        requestId: getRequestId(req),
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return jsonFail(
        500,
        action === "block"
          ? "Не удалось заблокировать собеседника. Попробуйте ещё раз."
          : "Не удалось разблокировать собеседника. Попробуйте ещё раз.",
        "INTERNAL_ERROR",
      );
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: NextRequest, ctx: { params: RouteParams }) {
  return handle(req, ctx, "block");
}

export async function DELETE(req: NextRequest, ctx: { params: RouteParams }) {
  return handle(req, ctx, "unblock");
}
