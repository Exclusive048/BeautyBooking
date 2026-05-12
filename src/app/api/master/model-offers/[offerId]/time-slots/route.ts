import { AccountType } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { computeAvailableTimeSlots } from "@/lib/master/model-offers-mutations";
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
 * Returns 30-min time slots inside the offer's time range that don't
 * conflict with the master's existing bookings. Drives the "Предложить
 * время" modal. Empty array is a valid response — the UI shows an empty
 * state suggesting the master closes the offer or shifts the time window.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!canAccessMasterOffers(user.roles)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const params = await ctx.params;
    const offerId = params.offerId;
    if (!offerId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const result = await computeAvailableTimeSlots({ offerId, userId: user.id });
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/model-offers/[offerId]/time-slots failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/model-offers/{offerId}/time-slots",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
