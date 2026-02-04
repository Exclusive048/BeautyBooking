import { BookingStatus } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type FinanceGroupBy = "masters" | "categories" | "services";

export type StudioFinanceRow = {
  key: string;
  label: string;
  visitsCount: number;
  sumAmount: number;
};

export type StudioFinanceData = {
  groupBy: FinanceGroupBy;
  rows: StudioFinanceRow[];
  totalVisits: number;
  totalAmount: number;
  hasCategories: boolean;
};

function startOfDayUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayUtc(value: string): Date {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

type AggregationBucket = {
  key: string;
  label: string;
  visitsCount: number;
  sumAmount: number;
};

function upsertBucket(
  buckets: Map<string, AggregationBucket>,
  input: { key: string; label: string; sumAmount: number }
): void {
  const existing = buckets.get(input.key);
  if (!existing) {
    buckets.set(input.key, {
      key: input.key,
      label: input.label,
      visitsCount: 1,
      sumAmount: input.sumAmount,
    });
    return;
  }
  existing.visitsCount += 1;
  existing.sumAmount += input.sumAmount;
}

export async function getStudioFinance(input: {
  studioId: string;
  from: string;
  to: string;
  groupBy: FinanceGroupBy;
}): Promise<StudioFinanceData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const fromDate = startOfDayUtc(input.from);
  const toDateExclusive = nextDayUtc(input.to);
  if (toDateExclusive <= fromDate) {
    throw new AppError("Invalid range", 400, "RANGE_INVALID");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ studioId: studio.id }, { providerId: studio.providerId }],
      startAtUtc: {
        gte: fromDate,
        lt: toDateExclusive,
      },
      status: {
        notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
      },
    },
    select: {
      id: true,
      masterProvider: {
        select: { id: true, name: true },
      },
      service: {
        select: {
          id: true,
          title: true,
          name: true,
          category: {
            select: { id: true, title: true },
          },
        },
      },
      serviceItems: {
        select: {
          priceSnapshot: true,
          titleSnapshot: true,
          service: {
            select: {
              id: true,
              title: true,
              name: true,
              category: {
                select: { id: true, title: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const hasCategories = bookings.some((booking) => {
    if (booking.service.category) return true;
    return booking.serviceItems.some((item) => Boolean(item.service?.category));
  });

  const buckets = new Map<string, AggregationBucket>();

  for (const booking of bookings) {
    const snapshotSum = booking.serviceItems.reduce((sum, item) => sum + Math.max(0, item.priceSnapshot), 0);
    const bookingAmount = snapshotSum > 0 ? snapshotSum : 0;

    if (input.groupBy === "masters") {
      const key = booking.masterProvider?.id ?? "master:unknown";
      const label = booking.masterProvider?.name ?? "Unknown master";
      upsertBucket(buckets, { key, label, sumAmount: bookingAmount });
      continue;
    }

    const firstItem = booking.serviceItems[0];
    if (input.groupBy === "services") {
      const key = firstItem?.service?.id ?? booking.service.id;
      const label =
        firstItem?.titleSnapshot?.trim() ||
        firstItem?.service?.title?.trim() ||
        firstItem?.service?.name ||
        booking.service.title?.trim() ||
        booking.service.name;
      upsertBucket(buckets, { key: `service:${key}`, label, sumAmount: bookingAmount });
      continue;
    }

    const categoryId = firstItem?.service?.category?.id ?? booking.service.category?.id ?? "category:uncategorized";
    const categoryTitle =
      firstItem?.service?.category?.title ?? booking.service.category?.title ?? "Uncategorized";
    upsertBucket(buckets, {
      key: `category:${categoryId}`,
      label: categoryTitle,
      sumAmount: bookingAmount,
    });
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.sumAmount - a.sumAmount);
  const totalVisits = rows.reduce((sum, item) => sum + item.visitsCount, 0);
  const totalAmount = rows.reduce((sum, item) => sum + item.sumAmount, 0);

  return {
    groupBy: input.groupBy,
    rows,
    totalVisits,
    totalAmount,
    hasCategories,
  };
}
