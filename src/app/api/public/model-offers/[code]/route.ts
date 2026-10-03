import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { publicModelOfferCodeParamSchema } from "@/lib/model-offers/schemas";
import { getPublicModelOffer } from "@/lib/model-offers/public.service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ code: string }>;
};

const NOT_FOUND_MESSAGE = "Предложение не найдено.";

/**
 * MOBILE-CLIENT-01 (G1) — одно предложение для моделей по публичному коду:
 * то же, что рендерит страница `/models/[code]` (`getPublicModelOffer` — те же
 * фильтры: активно, дата не прошла, мастер виден). `data.offer` — форма
 * элемента `GET /api/public/model-offers`, без внутренних id (правило 12).
 * Код невозможной формы, закрытое, прошедшее и несуществующее — один 404.
 * Сессия не нужна; лимит — общий тир прокси `publicApi`, как у списка.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const parsed = publicModelOfferCodeParamSchema.safeParse(await ctx.params);
    if (!parsed.success) return fail(NOT_FOUND_MESSAGE, 404, "NOT_FOUND");

    const offer = await getPublicModelOffer(parsed.data.code);
    if (!offer) return fail(NOT_FOUND_MESSAGE, 404, "NOT_FOUND");

    return ok({ offer });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code, appError.details);
    }
    logError("GET /api/public/model-offers/[code] failed", {
      requestId: getRequestId(req),
      route: "GET /api/public/model-offers/{code}",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail("Не удалось загрузить предложение. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
