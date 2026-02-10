import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { isDateKey } from "@/lib/schedule/dateKey";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> | { providerId: string } }
) {
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
    where: { id: p.providerId },
    select: { id: true, type: true, timezone: true },
  });
  if (!provider || provider.type !== "MASTER") {
    return fail("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const duration = await resolveServiceDuration(provider.id, serviceId);
  if (!duration.ok) return fail(duration.message, duration.status, duration.code);

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, price: true },
  });
  if (!service) return fail("Service not found", 404, "SERVICE_NOT_FOUND");

  const result = await listAvailabilitySlotsPaginated(provider.id, serviceId, duration.data, {
    fromKey,
    toKeyExclusive: toKey || undefined,
    limit,
  });
  if (!result.ok) return fail(result.message, result.status, result.code);

  const rule = await prisma.discountRule.findUnique({
    where: { providerId: provider.id },
    select: { isEnabled: true, applyMode: true, minPriceFrom: true, serviceIds: true },
  });

  const isServiceEligible = isServiceEligibleForHotRule(rule, serviceId, service.price);

  let slots = result.data.slots;
  if (isServiceEligible && slots.length > 0) {
    const now = new Date();
    const startAtUtc = slots[0]?.startAtUtc ?? null;
    const endAtUtc = slots[slots.length - 1]?.endAtUtc ?? null;
    if (startAtUtc && endAtUtc) {
      const hotSlots = await prisma.hotSlot.findMany({
        where: {
          providerId: provider.id,
          isActive: true,
          expiresAtUtc: { gt: now },
          startAtUtc: { gte: startAtUtc, lte: endAtUtc },
        },
        select: {
          startAtUtc: true,
          endAtUtc: true,
          discountType: true,
          discountValue: true,
          serviceId: true,
        },
      });
      const exactMap = new Map<string, (typeof hotSlots)[number]>();
      const startMap = new Map<string, (typeof hotSlots)[number]>();
      for (const slot of hotSlots) {
        const startKey = slot.startAtUtc.toISOString();
        if (slot.serviceId) {
          exactMap.set(`${startKey}:${slot.endAtUtc.toISOString()}`, slot);
        } else {
          startMap.set(startKey, slot);
        }
      }
      slots = slots.map((slot) => {
        const startKey = slot.startAtUtc.toISOString();
        const key = `${startKey}:${slot.endAtUtc.toISOString()}`;
        const hot = exactMap.get(key) ?? startMap.get(startKey);
        return hot
          ? {
              ...slot,
              isHot: true,
              discountType: hot.discountType,
              discountValue: hot.discountValue,
            }
          : { ...slot, isHot: false };
      });
    }
  }

  return ok({ timezone: provider.timezone, slots, meta: result.data.meta });
}
