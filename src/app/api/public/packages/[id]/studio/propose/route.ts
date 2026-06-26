import { z } from "zod";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { parseBody } from "@/lib/validation";
import { parseISOToUTC } from "@/lib/time";
import { proposeStudioPackagePlacement } from "@/lib/bookings/package-booking-studio";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * PACKAGE-BOOKING-MVP-2 — studio multi-master package proposal for the review
 * screen. Public (advisory only); the booking is re-validated on create. The
 * session is resolved (when present) so the accept-new-clients check matches
 * the eventual create — a returning client isn't prematurely blocked.
 */
const PROPOSE_RATE = { windowSeconds: 60, maxRequests: 30 };

const studioProposeSchema = z.object({
  selections: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        masterProviderId: z.string().trim().min(1),
        startAtUtc: z.string().trim().min(1),
      }),
    )
    .min(2, "В пакете должно быть минимум 2 услуги.")
    .max(12),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const rate = await checkRateLimit(
      `rl:/api/public/packages/studio/propose:ip:${getClientIp(req)}`,
      PROPOSE_RATE,
    );
    if (rate.limited) return tooManyRequests(rate.retryAfterSeconds);

    const p = params instanceof Promise ? await params : params;
    const body = await parseBody(req, studioProposeSchema);

    const selections = body.selections.map((s) => ({
      serviceId: s.serviceId,
      masterProviderId: s.masterProviderId,
      startAtUtc: parseISOToUTC(s.startAtUtc, "startAtUtc"),
    }));

    const session = await getSessionUserFromRequest(req);

    const result = await proposeStudioPackagePlacement({
      packageId: p.id,
      selections,
      clientUserId: session?.id ?? null,
    });

    if (!result.ok) {
      return jsonFail(409, result.message, result.code, {
        failedComponentIndex: result.failedComponentIndex,
        failedComponentName: result.failedComponentName,
      });
    }
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/public/packages/[id]/studio/propose failed", {
        requestId: getRequestId(req),
        route: "POST /api/public/packages/{id}/studio/propose",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
