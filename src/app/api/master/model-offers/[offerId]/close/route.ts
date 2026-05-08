import { AccountType } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { closeOfferWithCascade } from "@/lib/master/model-offers-mutations";
import { getRequestId, logError } from "@/lib/logging/logger";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export const runtime = "nodejs";

function canAccessMasterOffers(roles: AccountType[]): boolean {
  return roles.some((role) =>
    role === AccountType.MASTER || role === AccountType.STUDIO || role === AccountType.STUDIO_ADMIN
  );
}

/**
 * Thin wrapper over PATCH /api/master/model-offers/[offerId] with
 * `status: "CLOSED"`. Both routes call `closeOfferWithCascade` so the
 * cascade-reject logic lives in one place. The dedicated endpoint exists
 * mostly for UI semantics — `POST .../close` is shorter to call from a
 * confirm prompt and self-documenting in network logs.
 */
export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!canAccessMasterOffers(user.roles)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const params = await ctx.params;
    const offerId = params.offerId;
    if (!offerId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const result = await closeOfferWithCascade({ offerId, userId: user.id });

    return jsonOk({
      offer: { id: result.offerId, status: "CLOSED" },
      cascadedCount: result.cascadedCount,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/model-offers/[offerId]/close failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/model-offers/{offerId}/close",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
