import { ok, fail } from "@/lib/api/response";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { isDateKey } from "@/lib/schedule/dateKey";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

async function resolveDuration(masterId: string, serviceId: string) {
  return resolveServiceDuration(masterId, serviceId);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const p = params instanceof Promise ? await params : params;
    const url = new URL(req.url);
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const fromKey = url.searchParams.get("from") ?? "";
    const toKey = url.searchParams.get("to") ?? "";
    const limitRaw = url.searchParams.get("limit");

    if (!serviceId) return fail("Service id is required", 400, "SERVICE_REQUIRED");
    if (!isDateKey(fromKey)) return fail("Invalid from", 400, "DATE_INVALID");
    if (toKey && !isDateKey(toKey)) return fail("Invalid to", 400, "DATE_INVALID");

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    if (limitRaw && !Number.isFinite(limit)) {
      return fail("Invalid limit", 400, "LIMIT_INVALID");
    }

    const duration = await resolveDuration(p.id, serviceId);
    if (!duration.ok) return fail(duration.message, duration.status, duration.code);

    const result = await listAvailabilitySlotsPaginated(p.id, serviceId, duration.data, {
      fromKey,
      toKeyExclusive: toKey || undefined,
      limit,
    });
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ slots: result.data.slots, meta: result.data.meta });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/masters/[id]/availability failed", {
        requestId,
        route: "GET /api/masters/{id}/availability",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
