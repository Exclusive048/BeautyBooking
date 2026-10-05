import { z } from "zod";
import { toAppError } from "@/lib/api/errors";
import { fail, ok, tooManyRequests } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  loadInviteWithRelations,
  notifyStudioInviteReceived,
} from "@/lib/notifications/studio-notifications";
import { checkRateLimit, refundRateLimit, type RateLimitConfig } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { findPendingStudioMasterInvite } from "@/lib/studio/masters.service";

export const runtime = "nodejs";

const ROUTE = "POST /api/cabinet/studio/masters/{id}/invite/resend";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });

/** Три повтора в час на мастера — от кого бы из администраторов студии они ни шли. */
const INVITE_RESEND_LIMIT: RateLimitConfig = { windowSeconds: 60 * 60, maxRequests: 3 };

/**
 * MOBILE-STUDIO-C (team) — «Отправить приглашение ещё раз». Повторный
 * `POST /api/studio/masters` на тот же контакт уведомление не шлёт (только
 * новое приглашение), поэтому повтор — отдельное действие: то же уведомление
 * `STUDIO_INVITE_RECEIVED` (и письмо — для приглашения по почте), что при
 * отправке. `id` — `Provider.id` заготовки мастера в студии; студия — из сессии.
 *
 * Отказы (404 / 409 `MASTER_NOT_INVITED`) проверяются ДО лимита частоты и
 * попытку не тратят; сбой отправки (500) попытку возвращает.
 */
export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);

    const parsed = paramsSchema.safeParse(await ctx.params);
    if (!parsed.success) return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");

    const pending = await findPendingStudioMasterInvite({
      studioId: access.studioId,
      masterId: parsed.data.id,
    });

    const rateKey = routeRateLimitKey(req, "master", parsed.data.id);
    const rate = await checkRateLimit(rateKey, INVITE_RESEND_LIMIT);
    if (rate.limited) {
      if (rate.reason === "unavailable") {
        return fail(
          "Сейчас это временно недоступно. Попробуйте ещё раз через минуту.",
          503,
          "RATE_LIMIT_UNAVAILABLE",
        );
      }
      return tooManyRequests(
        rate.retryAfterSeconds,
        "Приглашение уже отправили несколько раз. Попробуйте через час.",
        "RATE_LIMITED",
      );
    }

    try {
      const invite = await loadInviteWithRelations(pending.inviteId);
      if (!invite) throw new Error("invite disappeared before resend");
      await notifyStudioInviteReceived(invite);
    } catch (error) {
      await refundRateLimit(rateKey);
      throw error;
    }

    return ok({ inviteId: pending.inviteId, channel: pending.channel });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code, appError.details);
    }
    logError(`${ROUTE} failed`, {
      requestId: getRequestId(req),
      route: ROUTE,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail("Не удалось отправить приглашение ещё раз. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
