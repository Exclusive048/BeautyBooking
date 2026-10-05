import { ok, fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getPublicProviderPackages } from "@/lib/providers/public-packages";
import { publicProviderKeyParamSchema } from "@/lib/providers/schemas";

type RouteContext = {
  params: Promise<{ providerId: string }>;
};

/**
 * MOBILE-B3 — пакеты услуг провайдера для нативного приложения: на вебе
 * каталог пакетов отдаёт только SSR страницы `/u/{username}`. Тело —
 * `getPublicProviderPackages`; ответ одинаков для всех зрителей, лимит —
 * общий `publicApi` прокси (как у соседних публичных GET провайдера).
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const parsed = publicProviderKeyParamSchema.safeParse(await ctx.params);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    return ok(await getPublicProviderPackages(parsed.data.providerId));
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code);
    }
    logError("GET /api/public/providers/[providerId]/packages failed", {
      requestId: getRequestId(req),
      route: "GET /api/public/providers/{providerId}/packages",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail("Не удалось загрузить пакеты услуг. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
