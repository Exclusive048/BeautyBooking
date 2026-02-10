import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { isDateKey } from "@/lib/schedule/dateKey";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapSlotsError(code?: string): string {
  switch (code) {
    case "SERVICE_REQUIRED":
      return "Не указана услуга.";
    case "DURATION_INVALID":
      return "Некорректная длительность услуги.";
    case "DATE_INVALID":
      return "Некорректная дата.";
    case "RANGE_INVALID":
      return "Некорректный диапазон.";
    case "PROVIDER_NOT_FOUND":
    case "MASTER_NOT_FOUND":
      return "Мастер не найден.";
    case "SERVICE_NOT_FOUND":
      return "Услуга не найдена.";
    case "SERVICE_INVALID":
      return "Услуга недоступна для мастера.";
    case "SERVICE_DISABLED":
      return "Услуга недоступна.";
    default:
      return "Не удалось загрузить слоты.";
  }
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
  const limitRaw = url.searchParams.get("limit");

  if (!serviceId) return fail("Не указана услуга.", 400, "SERVICE_REQUIRED");
  if (!isDateKey(fromKey)) return fail("Некорректная дата.", 400, "DATE_INVALID");
  if (toKey && !isDateKey(toKey)) return fail("Некорректная дата.", 400, "DATE_INVALID");

  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  if (limitRaw && !Number.isFinite(limit)) {
    return fail("Некорректный лимит.", 400, "LIMIT_INVALID");
  }

  const provider = await prisma.provider.findUnique({
    where: { id: p.providerId },
    select: { id: true, type: true, timezone: true },
  });
  if (!provider || provider.type !== "MASTER") {
    return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  const duration = await resolveServiceDuration(provider.id, serviceId);
  if (!duration.ok) {
    return fail(mapSlotsError(duration.code), duration.status, duration.code);
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, price: true },
  });
  if (!service) return fail("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");

  const result = await listAvailabilitySlotsPaginated(provider.id, serviceId, duration.data, {
    fromKey,
    toKeyExclusive: toKey || undefined,
    limit,
  });
  if (!result.ok) {
    return fail(mapSlotsError(result.code), result.status, result.code);
  }

  const rule = await prisma.discountRule.findUnique({
    where: { providerId: provider.id },
    select: { isEnabled: true, applyMode: true, minPriceFrom: true, serviceIds: true },
  });

  const isServiceEligible = isServiceEligibleForHotRule(rule, serviceId, service.price);

  const baseSlots = result.data.slots;
  type SlotLike = (typeof baseSlots)[number] & {
    isHot?: boolean;
    discountType?: string;
    discountValue?: number;
  };
  let decoratedSlots: SlotLike[] = baseSlots;

  if (isServiceEligible && baseSlots.length > 0) {
    const now = new Date();
    const rangeStart = toDate(baseSlots[0]?.startAtUtc ?? null);
    const rangeEnd = toDate(baseSlots[baseSlots.length - 1]?.endAtUtc ?? null);
    if (rangeStart && rangeEnd) {
      const hotSlots = await prisma.hotSlot.findMany({
        where: {
          providerId: provider.id,
          isActive: true,
          expiresAtUtc: { gt: now },
          startAtUtc: { gte: rangeStart, lte: rangeEnd },
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
        const startKey = toIso(slot.startAtUtc);
        const endKey = toIso(slot.endAtUtc);
        if (!startKey || !endKey) continue;
        if (slot.serviceId) {
          exactMap.set(`${startKey}:${endKey}`, slot);
        } else {
          startMap.set(startKey, slot);
        }
      }
      decoratedSlots = baseSlots.map((slot) => {
        const startKey = toIso(slot.startAtUtc);
        const endKey = toIso(slot.endAtUtc);
        if (!startKey || !endKey) return { ...slot, isHot: false };
        const key = `${startKey}:${endKey}`;
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

  const serializedSlots = decoratedSlots.map((slot) => ({
    ...slot,
    startAtUtc: toIso(slot.startAtUtc),
    endAtUtc: toIso(slot.endAtUtc),
  }));

  return ok({ timezone: provider.timezone, slots: serializedSlots, meta: result.data.meta });
}
