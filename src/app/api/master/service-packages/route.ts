import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { createMasterPackage } from "@/lib/master/services-mutations";
import { createMasterPackageSchema } from "@/lib/master/schemas";
import { listMasterServicePackages } from "@/lib/master/services-view.service";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * MOBILE-MASTER-C — все пакеты личного профиля мастера, включая выключенные
 * (веб читает их в SSR страницы «Услуги»). Цена — правило страницы
 * (`computePackagePricing`). Ответ личный — `no-store`; лимит — общий тир
 * прокси `publicApi` по аккаунту.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const packages = await listMasterServicePackages(masterId);
    return jsonOk({ packages }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/service-packages failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/service-packages",
        stack: error instanceof Error ? error.stack : undefined,
      });
      return jsonFail(500, "Не удалось загрузить пакеты. Попробуйте ещё раз.", "INTERNAL_ERROR");
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    const body = await parseBody(req, createMasterPackageSchema);
    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await createMasterPackage(masterId, body);
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/service-packages failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/service-packages",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
