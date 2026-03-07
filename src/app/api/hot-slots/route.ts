import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const hotSlotsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  geo: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

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

    const whereProvider =
      query.category
        ? {
            provider: {
              categories: { has: query.category },
            },
          }
        : {};

    const hotSlots = await prisma.hotSlot.findMany({
      where: {
        isActive: true,
        startAtUtc: { gte: from, lt: to },
        expiresAtUtc: { gt: now },
        ...whereProvider,
      },
      select: {
        id: true,
        providerId: true,
        serviceId: true,
        startAtUtc: true,
        endAtUtc: true,
        discountType: true,
        discountValue: true,
        isActive: true,
        provider: {
          select: {
            id: true,
            publicUsername: true,
            name: true,
            avatarUrl: true,
            avatarFocalX: true,
            avatarFocalY: true,
            address: true,
            district: true,
            ratingAvg: true,
            ratingCount: true,
            timezone: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            title: true,
            price: true,
            durationMin: true,
          },
        },
      },
      orderBy: [{ startAtUtc: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = hotSlots.length > query.limit;
    const pageHotSlots = hasMore ? hotSlots.slice(0, query.limit) : hotSlots;
    const nextCursor = hasMore ? pageHotSlots[pageHotSlots.length - 1]?.id ?? null : null;

    const providerIds = Array.from(new Set(pageHotSlots.map((slot) => slot.providerId)));
    const bookingConflicts =
      providerIds.length > 0
        ? await prisma.booking.findMany({
            where: {
              OR: [
                { providerId: { in: providerIds } },
                { masterProviderId: { in: providerIds } },
              ],
              status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
              startAtUtc: { not: null, gte: from, lt: to },
            },
            select: { providerId: true, masterProviderId: true, startAtUtc: true, endAtUtc: true },
          })
        : [];

    const conflictKeys = new Set(
      bookingConflicts
        .map((booking) =>
          booking.startAtUtc && booking.endAtUtc
            ? `${booking.masterProviderId ?? booking.providerId}:${booking.startAtUtc.toISOString()}:${booking.endAtUtc.toISOString()}`
            : null
        )
        .filter((key): key is string => Boolean(key))
    );

    const items = pageHotSlots
      .filter((slot) => slot.provider.publicUsername)
      .filter((slot) => {
        const key = `${slot.providerId}:${slot.startAtUtc.toISOString()}:${slot.endAtUtc.toISOString()}`;
        return !conflictKeys.has(key);
      })
      .map((slot) => ({
        id: slot.id,
        provider: {
          id: slot.provider.id,
          publicUsername: slot.provider.publicUsername,
          name: slot.provider.name,
          avatarUrl: slot.provider.avatarUrl,
          avatarFocalX: slot.provider.avatarFocalX ?? null,
          avatarFocalY: slot.provider.avatarFocalY ?? null,
          address: slot.provider.address,
          district: slot.provider.district,
          ratingAvg: slot.provider.ratingAvg,
          ratingCount: slot.provider.ratingCount,
          timezone: slot.provider.timezone,
        },
        slot: {
          startAtUtc: slot.startAtUtc.toISOString(),
          endAtUtc: slot.endAtUtc.toISOString(),
          discountType: slot.discountType,
          discountValue: slot.discountValue,
          isActive: slot.isActive,
        },
        service: slot.service
          ? {
              id: slot.service.id,
              title: slot.service.title?.trim() || slot.service.name,
              price: slot.service.price,
              durationMin: slot.service.durationMin,
            }
          : null,
      }))
      .sort((a, b) => {
        const timeDiff = new Date(a.slot.startAtUtc).getTime() - new Date(b.slot.startAtUtc).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.provider.ratingAvg - a.provider.ratingAvg;
      });

    return jsonOk({ items, nextCursor });
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
