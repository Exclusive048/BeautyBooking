import { ok, fail, tooManyRequests } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { AiSpendCeilingError } from "@/lib/ai/spend-ceiling";
import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { getReviewSummary } from "@/lib/ai/review-summary";
import { getClientIp } from "@/lib/http/ip";
import { logError } from "@/lib/logging/logger";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await ctx.params;

  const enabled = await getAiFeaturesEnabled();
  if (!enabled) {
    return fail("AI-функции отключены.", 503, "SYSTEM_FEATURE_DISABLED");
  }

  const ip = getClientIp(req);
  const limit = await checkRateLimit(`rl:ai:review-summary:${ip}`, RATE_LIMITS.aiReviewSummary);
  if (limit.limited) {
    return fail("Слишком много запросов. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  const provider = await resolveProviderBySlugOrId({
    key: providerId,
    select: { id: true },
    requirePublished: true,
  });

  if (!provider) {
    return fail("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  try {
    const result = await getReviewSummary(provider.id);
    return ok(result);
  } catch (error) {
    // FIX-B16: этот `catch` схлопывал ЛЮБУЮ ошибку в 500 «не удалось составить
    // сводку» — включая курируемые `AppError`, у которых есть свой статус и своя
    // правдивая строка. Для потолка это означало бы «у нас сломалось» вместо
    // «лимит на сегодня исчерпан», то есть продукт врал бы о причине.
    const appError = toAppError(error);
    // FIX-C3: у потолка есть честный `Retry-After` (секунды до UTC-полуночи), и
    // он здесь ТЕРЯЛСЯ — `fail()` заголовков не ставит, его ставит только
    // `tooManyRequests()`. Курируемая строка уезжала, а машиночитаемое «когда
    // можно повторить» — нет, хотя `AiSpendCeilingError` его уже посчитал.
    if (error instanceof AiSpendCeilingError) {
      return tooManyRequests(error.retryAfterSeconds, error.message, error.code);
    }
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code);
    }
    logError("Review summary generation failed", {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Не удалось составить сводку отзывов. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
