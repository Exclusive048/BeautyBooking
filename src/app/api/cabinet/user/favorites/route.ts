import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { listFavoritesEnriched } from "@/lib/client-cabinet/favorites.service";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * Enriched favorites payload for the redesigned cabinet UI. We keep the
 * legacy `/api/favorites` endpoint untouched (catalog & legacy consumers)
 * and serve the richer shape (visits, last visit, premium, photo, min
 * price, masters count) under the cabinet namespace.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const payload = await listFavoritesEnriched(user.id);
    return jsonOk(payload);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cabinet/user/favorites failed", {
        requestId: getRequestId(req),
        route: "GET /api/cabinet/user/favorites",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
