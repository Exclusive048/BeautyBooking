import { toAppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { publicReferenceCacheInit } from "@/lib/api/cache-headers";
import { withRequestContext } from "@/lib/api/with-request-context";
import { getPublicOrigin } from "@/lib/http/origin";
import { getRequestId, logError } from "@/lib/logging/logger";
import { buildMobileAppConfig } from "@/lib/mobile/app-config";

/**
 * MOBILE-AUTH-A — публичный конфиг нативного приложения: минимальная и
 * последняя версии по платформам, доступные методы входа, фичи, правовые
 * ссылки. Ответ одинаков для всех, поэтому — разделяемый кэш справочников
 * (путь в `PUBLIC_REFERENCE_API_PATHS`: прокси не приложит к нему сессию).
 *
 * ERROR-ENVELOPE-NEW-ROUTES: сбой (конфиг читает SystemConfig из БД) отвечает
 * конвертом без заголовка кэша — отказ не должен осесть в разделяемом кэше, а
 * приложение на старте разбирает ответ как JSON.
 */
export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    try {
      const config = await buildMobileAppConfig(getPublicOrigin(req));
      return ok(config, publicReferenceCacheInit());
    } catch (error) {
      const appError = toAppError(error);
      if (appError.status >= 500) {
        logError("GET /api/mobile/v1/config failed", {
          requestId: getRequestId(req),
          route: "GET /api/mobile/v1/config",
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      return fail(appError.message, appError.status, appError.code);
    }
  });
}
