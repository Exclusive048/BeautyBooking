import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";
import { listHotSlotServices } from "@/lib/hot-slots/service";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { diffDateKeys } from "@/lib/schedule/dateKey";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { toLocalDateKey, toLocalDateKeyExclusive } from "@/lib/schedule/timezone";
import { prisma } from "@/lib/prisma";

const hotSlotsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  geo: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type FeedItem = {
  id: string;
  provider: {
    id: string;
    publicUsername: string;
    name: string;
    avatarUrl: string | null;
    address: string;
    district: string;
    ratingAvg: number;
    ratingCount: number;
    timezone: string;
  };
  slot: {
    startAtUtc: string;
    endAtUtc: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    isActive: true;
  };
  service: {
    id: string;
    title: string;
    price: number;
    durationMin: number;
  } | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), hotSlotsQuerySchema);
    const now = new Date();
    const from = query.from ? new Date(query.from) : now;
    const to = query.to ? new Date(query.to) : new Date(now.getTime() + 48 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return jsonFail(400, "Некорректный диапазон дат.", "DATE_INVALID");
    }
    if (from > to) {
      return jsonFail(400, "Дата начала позже даты окончания.", "RANGE_INVALID");
    }

    const rules = await prisma.discountRule.findMany({
      where: {
        isEnabled: true,
        provider: {
          type: "MASTER",
          publicUsername: { not: null },
          ...(query.category ? { categories: { has: query.category } } : {}),
        },
      },
      select: {
        providerId: true,
        isEnabled: true,
        triggerHours: true,
        discountType: true,
        discountValue: true,
        applyMode: true,
        minPriceFrom: true,
        serviceIds: true,
        provider: {
          select: {
            id: true,
            publicUsername: true,
            name: true,
            avatarUrl: true,
            address: true,
            district: true,
            ratingAvg: true,
            ratingCount: true,
            timezone: true,
          },
        },
      },
    });

    const items: FeedItem[] = [];
    const seenKeys = new Set<string>();

    for (const rule of rules) {
      if (!rule.provider.publicUsername) continue;

      const services = await listHotSlotServices(rule.providerId);
      const eligibleServices = services.filter((service) =>
        isServiceEligibleForHotRule(rule, service.id, service.price)
      );
      if (eligibleServices.length === 0) continue;

      const fromKey = toLocalDateKey(from, rule.provider.timezone);
      const toKeyExclusive = toLocalDateKeyExclusive(to, rule.provider.timezone);
      const days = Math.max(1, Math.min(14, diffDateKeys(fromKey, toKeyExclusive)));

      for (const service of eligibleServices) {
        const slotsResult = await listAvailabilitySlotsPaginated(rule.providerId, service.id, service.durationMin, {
          fromKey,
          toKeyExclusive,
          limit: days,
        });
        if (!slotsResult.ok) continue;

        for (const slot of slotsResult.data.slots) {
          const slotStartAt = toDate(slot.startAtUtc);
          const slotEndAt = toDate(slot.endAtUtc);
          if (!slotStartAt || !slotEndAt) continue;
          if (slotStartAt < from || slotStartAt >= to) continue;

          const hot = resolveDynamicHotSlotPricing({
            rule,
            slotStartAtUtc: slotStartAt,
            serviceId: service.id,
            servicePrice: service.price,
            providerTimeZone: rule.provider.timezone,
            now,
          });
          if (!hot.isHot) continue;

          const id = `${rule.providerId}:${service.id}:${slotStartAt.toISOString()}:${slotEndAt.toISOString()}`;
          if (seenKeys.has(id)) continue;
          seenKeys.add(id);

          items.push({
            id,
            provider: {
              id: rule.provider.id,
              publicUsername: rule.provider.publicUsername,
              name: rule.provider.name,
              avatarUrl: rule.provider.avatarUrl,
              address: rule.provider.address,
              district: rule.provider.district,
              ratingAvg: rule.provider.ratingAvg,
              ratingCount: rule.provider.ratingCount,
              timezone: rule.provider.timezone,
            },
            slot: {
              startAtUtc: slotStartAt.toISOString(),
              endAtUtc: slotEndAt.toISOString(),
              discountType: hot.discountType ?? rule.discountType,
              discountValue: hot.discountValue ?? rule.discountValue,
              isActive: true,
            },
            service: {
              id: service.id,
              title: service.title,
              price: service.price,
              durationMin: service.durationMin,
            },
          });
        }
      }
    }

    items.sort((a, b) => {
      const timeDiff = new Date(a.slot.startAtUtc).getTime() - new Date(b.slot.startAtUtc).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.provider.ratingAvg - a.provider.ratingAvg;
    });

    let startIndex = 0;
    if (query.cursor) {
      const cursorIndex = items.findIndex((item) => item.id === query.cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const pageItems = items.slice(startIndex, startIndex + query.limit);
    const hasMore = startIndex + query.limit < items.length;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;

    return jsonOk({ items: pageItems, nextCursor });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/hot-slots failed", {
        requestId: getRequestId(req),
        route: "GET /api/hot-slots",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    const message = appError.code === "VALIDATION_ERROR" ? "Ошибка валидации." : appError.message;
    return jsonFail(appError.status, message, appError.code, appError.details);
  }
}
