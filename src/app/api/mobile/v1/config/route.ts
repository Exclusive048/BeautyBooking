import { ok } from "@/lib/api/response";
import { publicReferenceCacheInit } from "@/lib/api/cache-headers";
import { withRequestContext } from "@/lib/api/with-request-context";
import { getPublicOrigin } from "@/lib/http/origin";
import { buildMobileAppConfig } from "@/lib/mobile/app-config";

/**
 * MOBILE-AUTH-A — публичный конфиг нативного приложения: минимальная и
 * последняя версии по платформам, доступные методы входа, фичи, правовые
 * ссылки. Ответ одинаков для всех, поэтому — разделяемый кэш справочников
 * (путь в `PUBLIC_REFERENCE_API_PATHS`: прокси не приложит к нему сессию).
 */
export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    const config = await buildMobileAppConfig(getPublicOrigin(req));
    return ok(config, publicReferenceCacheInit());
  });
}
