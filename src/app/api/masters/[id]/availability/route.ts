import { ok, fail } from "@/lib/api/response";
import { listAvailabilitySlots } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { ensureStartNotAfterEnd, parseISOToUTC } from "@/lib/time";
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
    const fromRaw = url.searchParams.get("from") ?? "";
    const toRaw = url.searchParams.get("to") ?? "";

    if (!serviceId) return fail("Service id is required", 400, "SERVICE_REQUIRED");

    const from = parseISOToUTC(fromRaw, "from");
    const to = parseISOToUTC(toRaw, "to");
    ensureStartNotAfterEnd(from, to, "to");

    const duration = await resolveDuration(p.id, serviceId);
    if (!duration.ok) return fail(duration.message, duration.status, duration.code);

    const result = await listAvailabilitySlots(p.id, serviceId, duration.data, { from, to });
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ slots: result.data });
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
