import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { publicModelOffersQuerySchema } from "@/lib/model-offers/schemas";
import { listPublicModelOffers } from "@/lib/model-offers/public.service";
import { findActiveCityBySlug } from "@/lib/cities/server-city";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), publicModelOffersQuerySchema);
    // MOBILE-B1: `city` здесь исторически — подстрока адреса (названия из
    // `citySuggestions`). Совпал со slug активного города — фильтр по городу,
    // как у SSR `/models`; иначе — прежний поиск по адресу. Поэтому здесь, в
    // отличие от остальных лент, неизвестный `city` не 400: старый смысл жив.
    const city = query.city ? await findActiveCityBySlug(query.city) : null;
    const result = await listPublicModelOffers(
      city ? { ...query, city: undefined, cityId: city.id } : query,
    );
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/public/model-offers failed", {
        requestId: getRequestId(req),
        route: "GET /api/public/model-offers",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
