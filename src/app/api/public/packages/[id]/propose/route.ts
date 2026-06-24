import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { parseISOToUTC } from "@/lib/time";
import { proposeSoloPackagePlacement } from "@/lib/bookings/package-booking";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";

/**
 * PACKAGE-BOOKING-MVP-1 — sequential-placement proposal for the review
 * screen. Public (advisory only); the booking is re-validated on create.
 */
const PROPOSE_RATE = { windowSeconds: 60, maxRequests: 30 };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const rate = await checkRateLimit(
      `rl:/api/public/packages/propose:ip:${getClientIp(req)}`,
      PROPOSE_RATE,
    );
    if (rate.limited) return tooManyRequests(rate.retryAfterSeconds);

    const p = params instanceof Promise ? await params : params;
    const body = (await req.json().catch(() => null)) as { startAtUtc?: unknown } | null;
    const startRaw = typeof body?.startAtUtc === "string" ? body.startAtUtc : "";
    if (!startRaw) return jsonFail(400, "Не указано время начала.", "DATE_INVALID");

    const startAtUtc = parseISOToUTC(startRaw, "startAtUtc");
    const result = await proposeSoloPackagePlacement({ packageId: p.id, startAtUtc });

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
      logError("POST /api/public/packages/[id]/propose failed", {
        requestId: getRequestId(req),
        route: "POST /api/public/packages/{id}/propose",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
