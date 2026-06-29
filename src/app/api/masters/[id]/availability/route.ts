import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { listBookableSlots } from "@/lib/schedule/bookable-window";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

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

    const provider = await prisma.provider.findUnique({
      where: { id: p.id },
      // EXP-025: `minBookingHoursAhead` is required so the shared
      // bookable-window primitive can drop too-soon slots — the cutoff
      // this endpoint previously skipped (vs `/slots`).
      select: { id: true, timezone: true, minBookingHoursAhead: true },
    });
    if (!provider) return fail("Master not found", 404, "MASTER_NOT_FOUND");

    const duration = await resolveServiceDuration(p.id, serviceId);
    if (!duration.ok) return fail(duration.message, duration.status, duration.code);

    // EXP-026: align `to` to the inclusive contract `/slots` documents
    // (callers today never send `to`; this just stops the two endpoints
    // disagreeing on the off-by-one). Convert inclusive `to` → exclusive.
    const toKeyExclusive = toKey ? addDaysToDateKey(toKey, 1) : undefined;

    // EXP-025: same primitive as `/slots` → min-ahead + schedule filter
    // applied identically. A slot returned here is one `assertBookingWindow`
    // will accept at submit.
    const bookable = await listBookableSlots({
      provider,
      serviceId,
      durationMinutes: duration.data,
      fromKey,
      toKeyExclusive,
      limit,
      now: new Date(),
    });
    if (!bookable.ok) return fail(bookable.message, bookable.status, bookable.code);

    return ok({ slots: bookable.slots, meta: bookable.meta });
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
