import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { createGuestReview, resolveGuestManageScope } from "@/lib/bookings/guest-manage";
import { guestManageRateLimitRefusal } from "@/lib/bookings/guest-manage-route";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";
import { afterReviewCreated } from "@/lib/reviews/after-create";
import { createReviewSchema } from "@/lib/reviews/schemas";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * 29.09 доработки · 05 — отзыв гостя по ссылке «Управлять записью». Право —
 * подписанный токен в пути (`guest-manage.ts`), сессия не нужна. Правила те же,
 * что у клиента в кабинете (`createReview`); побочные эффекты — общий
 * `afterReviewCreated`. Правки и удаления по ссылке нет (решение владельца).
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const refusal = await guestManageRateLimitRefusal(routeRateLimitKey(req, "ip", getClientIp(req)));
    if (refusal) return refusal;

    const { token } = await ctx.params;
    const scope = await resolveGuestManageScope(token);
    const body = await parseBody(req, createReviewSchema);
    const review = await createGuestReview(scope, body);
    await afterReviewCreated(review, {
      requestId: getRequestId(req),
      route: "POST /api/public/bookings/manage/{token}/review",
    });
    return jsonOk({ review }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/public/bookings/manage/[token]/review failed", {
        requestId: getRequestId(req),
        route: "POST /api/public/bookings/manage/{token}/review",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
