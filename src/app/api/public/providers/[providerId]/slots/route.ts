import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { listAvailabilitySlots } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { dateFromLocalDateKey, compareDateKeys } from "@/lib/schedule/dateKey";

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> | { providerId: string } }
) {
  const p = params instanceof Promise ? await params : params;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const fromKey = url.searchParams.get("from") ?? "";
  const toKey = url.searchParams.get("to") ?? "";

  if (!serviceId) return fail("Service id is required", 400, "SERVICE_REQUIRED");
  if (!isDateKey(fromKey) || !isDateKey(toKey)) return fail("Invalid date range", 400, "DATE_INVALID");
  if (compareDateKeys(fromKey, toKey) >= 0) return fail("Invalid date range", 400, "RANGE_INVALID");

  const provider = await prisma.provider.findUnique({
    where: { id: p.providerId },
    select: { id: true, type: true, timezone: true },
  });
  if (!provider || provider.type !== "MASTER") {
    return fail("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const duration = await resolveServiceDuration(provider.id, serviceId);
  if (!duration.ok) return fail(duration.message, duration.status, duration.code);

  const from = dateFromLocalDateKey(fromKey, provider.timezone, 0, 0);
  const to = dateFromLocalDateKey(toKey, provider.timezone, 0, 0);

  const result = await listAvailabilitySlots(provider.id, serviceId, duration.data, { from, to });
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ timezone: provider.timezone, slots: result.data });
}
