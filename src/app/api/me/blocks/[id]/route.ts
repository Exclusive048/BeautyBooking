import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { removeMyChatBlock } from "@/lib/chat/blocks";
import { getRequestId, logError } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";

export const runtime = "nodejs";

const RATE_LIMIT = { maxRequests: 30, windowSeconds: 3600 };
const blockIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const NOT_FOUND_MESSAGE = "Не удалось найти блокировку. Обновите список.";

/**
 * MOBILE-POLISH (App Store 1.2) — снять блок из списка «Заблокированные»
 * (`GET /api/me/blocks`). Только свой: чужой или несуществующий — 404
 * без различия «чей». Ответ — `200 {}`; переписка снова открыта, если
 * собеседник со своей стороны вас не блокировал.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

    const parsed = blockIdSchema.safeParse((await ctx.params).id);
    if (!parsed.success) {
      return jsonFail(404, NOT_FOUND_MESSAGE, "NOT_FOUND");
    }

    await removeMyChatBlock(user.userId, parsed.data);
    return jsonOk({}, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/me/blocks/[id] failed", {
        requestId: getRequestId(req),
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return jsonFail(500, "Не удалось разблокировать собеседника. Попробуйте ещё раз.", "INTERNAL_ERROR");
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
