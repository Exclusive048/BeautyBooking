import { DiscountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { addDaysToDateKey, dateFromLocalDateKey, diffDateKeys } from "@/lib/schedule/dateKey";
import { toLocalDateKey, toLocalDateKeyExclusive } from "@/lib/schedule/timezone";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveProviderForHotSlots } from "@/lib/hot-slots/service";
import { notifyHotSlotSubscribers } from "@/lib/hot-slots/notifications";

const BATCH_SIZE = 50;

type SmartPriceJobStats = {
  processed: number;
  skipped: number;
  created: number;
  notified: number;
};

function resolveSmartPriceWindow(now: Date, timeZone: string, triggerHours: number) {
  if (triggerHours === 0) {
    const todayKey = toLocalDateKey(now, timeZone);
    const nextKey = addDaysToDateKey(todayKey, 1);
    const endAtUtc = dateFromLocalDateKey(nextKey, timeZone, 0, 0);
    return {
      windowStart: now,
      windowEnd: endAtUtc,
      fromKey: todayKey,
      toKeyExclusive: nextKey,
    };
  }

  const endAtUtc = new Date(now.getTime() + triggerHours * 60 * 60 * 1000);
  const fromKey = toLocalDateKey(now, timeZone);
  const toKeyExclusive = toLocalDateKeyExclusive(endAtUtc, timeZone);
  return {
    windowStart: now,
    windowEnd: endAtUtc,
    fromKey,
    toKeyExclusive,
  };
}

async function processOneRule(input: {
  providerId: string;
  triggerHours: number;
  discountType: DiscountType;
  discountValue: number;
  applyMode: "ALL_SERVICES" | "PRICE_FROM" | "MANUAL";
  minPriceFrom: number | null;
  serviceIds: string[];
  now: Date;
}): Promise<{ created: number; notified: number }> {
  const { providerId, triggerHours, discountType, discountValue, applyMode, minPriceFrom, serviceIds, now } = input;

  const { provider, services } = await resolveProviderForHotSlots(providerId);

  let eligible = services;
  if (applyMode === "MANUAL") {
    const allowed = new Set(serviceIds);
    eligible = services.filter((s) => allowed.has(s.id));
  } else if (applyMode === "PRICE_FROM") {
    const minPrice = minPriceFrom ?? 0;
    eligible = services.filter((s) => s.price >= minPrice);
  }

  if (eligible.length === 0) return { created: 0, notified: 0 };

  const anchor = [...eligible].sort((a, b) => a.durationMin - b.durationMin)[0];
  if (!anchor) return { created: 0, notified: 0 };

  const window = resolveSmartPriceWindow(now, provider.timezone, triggerHours);
  const days = Math.max(1, Math.min(14, diffDateKeys(window.fromKey, window.toKeyExclusive)));

  const slotsResult = await listAvailabilitySlotsPaginated(provider.id, anchor.id, anchor.durationMin, {
    fromKey: window.fromKey,
    toKeyExclusive: window.toKeyExclusive,
    limit: days,
  });

  if (!slotsResult.ok) {
    logError("Smart price job: failed to load slots", {
      providerId: provider.id,
      status: slotsResult.status,
      code: slotsResult.code,
      message: slotsResult.message,
    });
    return { created: 0, notified: 0 };
  }

  const freeSlots = slotsResult.data.slots.filter(
    (slot) => slot.startAtUtc >= window.windowStart && slot.startAtUtc <= window.windowEnd
  );

  if (freeSlots.length === 0) return { created: 0, notified: 0 };

  const shouldAttachService =
    (applyMode === "MANUAL" && serviceIds.length === 1) ||
    (applyMode === "PRICE_FROM" && eligible.length === 1);
  const hotServiceId = shouldAttachService ? (eligible[0]?.id ?? null) : null;
  const hotServiceTitle = hotServiceId
    ? (eligible.find((s) => s.id === hotServiceId)?.title ?? null)
    : null;

  const expiresAtUtc = window.windowEnd;

  let created = 0;
  const newSlots: { startAtUtc: Date }[] = [];

  for (const slot of freeSlots) {
    try {
      await prisma.hotSlot.create({
        data: {
          providerId: provider.id,
          serviceId: hotServiceId,
          startAtUtc: slot.startAtUtc,
          endAtUtc: slot.endAtUtc,
          discountType,
          discountValue,
          isAuto: true,
          isActive: true,
          expiresAtUtc,
        },
      });
      created += 1;
      newSlots.push({ startAtUtc: slot.startAtUtc });
    } catch {
      // Skip duplicate slots (@@unique constraint on providerId+startAtUtc+endAtUtc)
    }
  }

  let notified = 0;
  if (newSlots.length > 0) {
    await notifyHotSlotSubscribers({
      providerId: provider.id,
      providerName: provider.name,
      providerPublicUsername: provider.publicUsername ?? null,
      timezone: provider.timezone,
      discountType,
      discountValue,
      serviceTitle: hotServiceTitle,
      slots: newSlots,
    });
    notified = 1;
  }

  return { created, notified };
}

export async function runSmartPriceJob(now = new Date()): Promise<SmartPriceJobStats> {
  const stats: SmartPriceJobStats = { processed: 0, skipped: 0, created: 0, notified: 0 };

  let cursor: string | undefined;

  while (true) {
    const rules = await prisma.discountRule.findMany({
      where: { isEnabled: true, smartPriceEnabled: true },
      select: {
        providerId: true,
        triggerHours: true,
        discountType: true,
        discountValue: true,
        applyMode: true,
        minPriceFrom: true,
        serviceIds: true,
      },
      orderBy: { providerId: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { providerId: cursor } } : {}),
    });

    if (rules.length === 0) break;

    for (const rule of rules) {
      try {
        const result = await processOneRule({
          providerId: rule.providerId,
          triggerHours: rule.triggerHours,
          discountType: rule.discountType,
          discountValue: rule.discountValue,
          applyMode: rule.applyMode,
          minPriceFrom: rule.minPriceFrom,
          serviceIds: rule.serviceIds,
          now,
        });
        stats.created += result.created;
        stats.notified += result.notified;
        stats.processed += 1;
      } catch (error) {
        logError("Smart price job: failed to process rule", {
          providerId: rule.providerId,
          message: error instanceof Error ? error.message : String(error),
        });
        stats.skipped += 1;
      }
    }

    cursor = rules[rules.length - 1]?.providerId;
    if (rules.length < BATCH_SIZE) break;
  }

  logInfo("runSmartPriceJob completed", stats);
  return stats;
}

export async function runHotSlotExpiringJob(now = new Date()): Promise<void> {
  const result = await prisma.hotSlot.updateMany({
    where: {
      isAuto: true,
      isActive: true,
      expiresAtUtc: { lt: now },
    },
    data: { isActive: false },
  });

  if (result.count > 0) {
    logInfo("runHotSlotExpiringJob: deactivated expired auto slots", { count: result.count });
  }
}
