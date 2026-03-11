import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export const runtime = "nodejs";

type FreeSlotItem = {
  time: string;
  startsAt: string;
  categoryId: string;
  categoryName: string;
  maxFitDuration: number;
  allFit: boolean;
  serviceId: string | null;
};

type CategoryFit = {
  id: string;
  name: string;
  maxDuration: number;
  minDuration: number;
  maxServiceId: string | null;
  minServiceId: string | null;
};

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const masterId = await getCurrentMasterProviderId(auth.user.id);
    const provider = await prisma.provider.findUnique({
      where: { id: masterId },
      select: { id: true, timezone: true },
    });
    if (!provider) {
      return jsonFail(404, "Master not found", "MASTER_NOT_FOUND");
    }

    const now = new Date();
    const todayKey = toLocalDateKey(now, provider.timezone);
    const dayStartUtc = dateFromLocalDateKey(todayKey, provider.timezone, 0, 0);
    const dayEndUtc = dateFromLocalDateKey(addDaysToDateKey(todayKey, 1), provider.timezone, 0, 0);

    const [bookings, services] = await Promise.all([
      prisma.booking.findMany({
        where: {
          OR: [{ masterProviderId: masterId }, { masterProviderId: null, providerId: masterId }],
          startAtUtc: { gte: dayStartUtc, lt: dayEndUtc },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { startAtUtc: true, endAtUtc: true },
        orderBy: { startAtUtc: "asc" },
      }),
      prisma.service.findMany({
        where: {
          providerId: masterId,
          isActive: true,
          isEnabled: true,
        },
        select: {
          id: true,
          durationMin: true,
          globalCategoryId: true,
          globalCategory: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const categoryMap = new Map<string, CategoryFit>();
    for (const service of services) {
      if (!service.globalCategoryId || !service.globalCategory) continue;
      const duration = service.durationMin;
      const existing = categoryMap.get(service.globalCategoryId);
      if (!existing) {
        categoryMap.set(service.globalCategoryId, {
          id: service.globalCategoryId,
          name: service.globalCategory.name,
          maxDuration: duration,
          minDuration: duration,
          maxServiceId: service.id,
          minServiceId: service.id,
        });
        continue;
      }

      if (duration > existing.maxDuration) {
        existing.maxDuration = duration;
        existing.maxServiceId = service.id;
      }
      if (duration < existing.minDuration) {
        existing.minDuration = duration;
        existing.minServiceId = service.id;
      }
    }

    const categories = Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const slots: FreeSlotItem[] = [];

    for (let hour = 9; hour <= 21; hour += 1) {
      const slotStartUtc = dateFromLocalDateKey(todayKey, provider.timezone, hour, 0);
      if (slotStartUtc.getTime() < now.getTime()) continue;

      const overlapsExistingBooking = bookings.some((item) => {
        if (!item.startAtUtc || !item.endAtUtc) return false;
        const startMs = item.startAtUtc.getTime();
        const endMs = item.endAtUtc.getTime();
        const slotStartMs = slotStartUtc.getTime();
        return slotStartMs >= startMs && slotStartMs < endMs;
      });
      if (overlapsExistingBooking) continue;

      const nextBooking = bookings.find(
        (item) => item.startAtUtc && item.startAtUtc.getTime() >= slotStartUtc.getTime()
      );
      const nextBookingStartMs = nextBooking?.startAtUtc?.getTime() ?? dayEndUtc.getTime();
      const minutesAvailable = Math.floor((nextBookingStartMs - slotStartUtc.getTime()) / 60000);
      if (minutesAvailable <= 0) continue;

      for (const category of categories) {
        if (category.minDuration > minutesAvailable) continue;

        const allFit = category.maxDuration <= minutesAvailable;
        slots.push({
          time: `${String(hour).padStart(2, "0")}:00`,
          startsAt: slotStartUtc.toISOString(),
          categoryId: category.id,
          categoryName: category.name,
          maxFitDuration: allFit ? category.maxDuration : category.minDuration,
          allFit,
          serviceId: allFit ? category.maxServiceId : category.minServiceId,
        });
      }
    }

    return jsonOk({
      date: dayStartUtc.toISOString(),
      timezone: provider.timezone,
      slots,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cabinet/master/dashboard/free-slots failed", {
        requestId: getRequestId(req),
        route: "GET /api/cabinet/master/dashboard/free-slots",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
