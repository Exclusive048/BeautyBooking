import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { ProviderType } from "@prisma/client";
import { addDaysToDateKey, dateFromLocalDateKey, diffDateKeys } from "@/lib/schedule/dateKey";
import { toLocalDateKey, toLocalDateKeyExclusive } from "@/lib/schedule/timezone";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { resolveProviderForHotSlots } from "@/lib/hot-slots/service";

type HotSlotsJobStats = {
  processed: number;
  skipped: number;
  activated: number;
};

function resolveWindow(now: Date, timeZone: string, triggerHours: number) {
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

export async function runHotSlotsJob(now = new Date()): Promise<HotSlotsJobStats> {
  const rules = await prisma.discountRule.findMany({
    where: { isEnabled: true },
    select: {
      providerId: true,
      triggerHours: true,
      discountType: true,
      discountValue: true,
      applyMode: true,
      minPriceFrom: true,
      serviceIds: true,
    },
  });

  const stats: HotSlotsJobStats = { processed: 0, skipped: 0, activated: 0 };

  for (const rule of rules) {
    try {
      const { provider, services } = await resolveProviderForHotSlots(rule.providerId);
      if (provider.type !== ProviderType.MASTER) {
        stats.skipped += 1;
        continue;
      }

      let eligible = services;
      if (rule.applyMode === "MANUAL") {
        const allowed = new Set(rule.serviceIds);
        eligible = services.filter((service) => allowed.has(service.id));
      }
      if (rule.applyMode === "PRICE_FROM") {
        const minPrice = rule.minPriceFrom ?? 0;
        eligible = services.filter((service) => service.price >= minPrice);
      }

      await prisma.hotSlot.updateMany({
        where: { providerId: provider.id },
        data: { isActive: false },
      });
      await invalidateSlotsForMaster(provider.id);

      if (eligible.length === 0) {
        stats.skipped += 1;
        continue;
      }

      const anchor = [...eligible].sort((a, b) => a.durationMin - b.durationMin)[0];
      if (!anchor) {
        stats.skipped += 1;
        continue;
      }

      const window = resolveWindow(now, provider.timezone, rule.triggerHours);
      const days = Math.max(1, Math.min(14, diffDateKeys(window.fromKey, window.toKeyExclusive)));

      const slotsResult = await listAvailabilitySlotsPaginated(provider.id, anchor.id, anchor.durationMin, {
        fromKey: window.fromKey,
        toKeyExclusive: window.toKeyExclusive,
        limit: days,
      });

      if (!slotsResult.ok) {
        logError("Hot slots job failed to load slots", {
          providerId: provider.id,
          status: slotsResult.status,
          code: slotsResult.code,
          message: slotsResult.message,
        });
        stats.skipped += 1;
        continue;
      }

      const visibleSlots = slotsResult.data.slots.filter(
        (slot) => slot.startAtUtc >= window.windowStart && slot.startAtUtc <= window.windowEnd
      );

      const shouldAttachService =
        (rule.applyMode === "MANUAL" && rule.serviceIds.length === 1) ||
        (rule.applyMode === "PRICE_FROM" && eligible.length === 1);
      const hotServiceId = shouldAttachService ? eligible[0]?.id ?? null : null;

      const reasonBase =
        rule.applyMode === "ALL_SERVICES"
          ? "all_services"
          : rule.applyMode === "PRICE_FROM"
            ? `price_from:${rule.minPriceFrom ?? 0}`
            : "manual";
      const reason = hotServiceId ? reasonBase : `${reasonBase};anchor=${anchor.id}`;

      const ops = visibleSlots.map((slot) =>
        prisma.hotSlot.upsert({
          where: {
            providerId_startAtUtc_endAtUtc: {
              providerId: provider.id,
              startAtUtc: slot.startAtUtc,
              endAtUtc: slot.endAtUtc,
            },
          },
          create: {
            providerId: provider.id,
            serviceId: hotServiceId,
            startAtUtc: slot.startAtUtc,
            endAtUtc: slot.endAtUtc,
            discountType: rule.discountType,
            discountValue: rule.discountValue,
            isActive: true,
            activatedAt: now,
            expiresAtUtc: slot.startAtUtc,
            reason,
          },
          update: {
            serviceId: hotServiceId,
            discountType: rule.discountType,
            discountValue: rule.discountValue,
            isActive: true,
            activatedAt: now,
            expiresAtUtc: slot.startAtUtc,
            reason,
          },
        })
      );

      if (ops.length > 0) {
        await prisma.$transaction(ops);
      }

      stats.processed += 1;
      stats.activated += visibleSlots.length;
    } catch (error) {
      logError("Hot slots job failed", {
        providerId: rule.providerId,
        message: error instanceof Error ? error.message : String(error),
      });
      stats.skipped += 1;
    }
  }

  logInfo("Hot slots job completed", stats);
  return stats;
}
