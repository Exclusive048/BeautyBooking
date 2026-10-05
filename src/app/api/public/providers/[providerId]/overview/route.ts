import { ok, fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { toAppError } from "@/lib/api/errors";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getPublicProviderOverview } from "@/lib/providers/public-overview";
import { publicProviderKeyParamSchema } from "@/lib/providers/schemas";

type RouteContext = {
  params: Promise<{ providerId: string }>;
};

/**
 * MOBILE-B3 — данные шапки страницы провайдера, которых нет в
 * `GET /api/providers/{key}` (тариф, стаж, ближайшее окошко, студия), и флаги
 * зрителя (избранное, владелец, запись для отзыва). Сессия необязательна:
 * `Authorization: Bearer` главнее куки (`getSessionUserFromRequest`); битый
 * или протухший токен — гость, не 401. Тело — `getPublicProviderOverview`.
 *
 * Ответ зависит от зрителя, поэтому `Cache-Control` не ставится; общая часть
 * кэшируется на сервере на минуту (`public-overview.ts`), `viewer` — никогда.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const parsed = publicProviderKeyParamSchema.safeParse(await ctx.params);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    const viewer = await getSessionUserFromRequest(req);
    return ok(
      await getPublicProviderOverview({
        providerKey: parsed.data.providerId,
        viewerUserId: viewer?.id ?? null,
      }),
    );
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code);
    }
    logError("GET /api/public/providers/[providerId]/overview failed", {
      requestId: getRequestId(req),
      route: "GET /api/public/providers/{providerId}/overview",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail("Не удалось загрузить профиль. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
