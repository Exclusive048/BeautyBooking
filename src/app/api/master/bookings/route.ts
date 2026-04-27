import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { createSoloMasterBooking } from "@/lib/master/day.service";
import { createMasterBookingSchema } from "@/lib/master/schemas";
import { parseBody, parseQuery } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";

export const runtime = "nodejs";

const listQuerySchema = z.object({
  filter: z.enum(["all", "today", "upcoming", "finished", "cancelled"]).default("all"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).optional(),
});

type BookingListItem = {
  id: string;
  slotLabel: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  status: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
};

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const masterId = await getCurrentMasterProviderId(user.id);
    const query = parseQuery(new URL(req.url), listQuerySchema);
    const now = new Date();

    // Build date range filter
    let startFrom: Date | undefined;
    let startBefore: Date | undefined;

    if (query.date) {
      startFrom = new Date(`${query.date}T00:00:00.000Z`);
      startBefore = new Date(`${query.date}T23:59:59.999Z`);
    } else if (query.filter === "today") {
      const todayStr = now.toISOString().slice(0, 10);
      startFrom = new Date(`${todayStr}T00:00:00.000Z`);
      startBefore = new Date(`${todayStr}T23:59:59.999Z`);
    }

    // Status filter for DB query
    const dbStatusFilter =
      query.filter === "finished"
        ? { status: { in: ["FINISHED" as const] } }
        : query.filter === "cancelled"
        ? { status: { in: ["CANCELLED" as const, "REJECTED" as const, "NO_SHOW" as const] } }
        : query.filter === "upcoming"
        ? { status: { in: ["NEW" as const, "PENDING" as const, "CONFIRMED" as const, "PREPAID" as const, "CHANGE_REQUESTED" as const] } }
        : {};

    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { masterProviderId: masterId },
          { masterProviderId: null, providerId: masterId },
        ],
        ...(startFrom ? { startAtUtc: { gte: startFrom, ...(startBefore ? { lte: startBefore } : {}) } } : {}),
        ...dbStatusFilter,
      },
      select: {
        id: true,
        slotLabel: true,
        startAtUtc: true,
        endAtUtc: true,
        status: true,
        clientName: true,
        clientPhone: true,
        actionRequiredBy: true,
        service: { select: { name: true, title: true, price: true, durationMin: true } },
        serviceItems: { select: { priceSnapshot: true } },
      },
      orderBy: { startAtUtc: query.filter === "finished" ? "desc" : "asc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    // Pagination
    const hasMore = bookings.length > query.limit;
    const page = hasMore ? bookings.slice(0, query.limit) : bookings;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    // Map and apply search + runtime status
    const items: BookingListItem[] = [];
    for (const b of page) {
      const runtimeStatus = resolveBookingRuntimeStatus({
        status: b.status,
        startAtUtc: b.startAtUtc,
        endAtUtc: b.endAtUtc,
        now,
      });

      // Post-filter for finished/cancelled using runtime status
      if (query.filter === "finished" && runtimeStatus !== "FINISHED" && runtimeStatus !== "IN_PROGRESS") continue;
      if (query.filter === "cancelled" && runtimeStatus !== "REJECTED") continue;
      if (query.filter === "upcoming" && (runtimeStatus === "FINISHED" || runtimeStatus === "REJECTED" || runtimeStatus === "IN_PROGRESS")) continue;

      const serviceName = b.service?.title?.trim() || b.service?.name || "";
      const price =
        b.serviceItems.length > 0
          ? b.serviceItems.reduce((sum, item) => sum + (item.priceSnapshot ?? 0), 0)
          : b.service?.price ?? 0;

      // Search filter
      if (query.search) {
        const q = query.search.toLowerCase();
        if (!b.clientName.toLowerCase().includes(q) && !serviceName.toLowerCase().includes(q)) {
          continue;
        }
      }

      items.push({
        id: b.id,
        slotLabel: b.slotLabel,
        startAtUtc: b.startAtUtc?.toISOString() ?? null,
        endAtUtc: b.endAtUtc?.toISOString() ?? null,
        status: runtimeStatus,
        clientName: b.clientName,
        clientPhone: b.clientPhone,
        serviceName,
        servicePrice: price,
        serviceDurationMin: b.service?.durationMin ?? 0,
        actionRequiredBy: (b.actionRequiredBy as "CLIENT" | "MASTER" | null) ?? null,
      });
    }

    return jsonOk({ bookings: items, nextCursor });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/bookings failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/bookings",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, createMasterBookingSchema);
    const data = await createSoloMasterBooking({
      masterId,
      serviceId: body.serviceId,
      startAt: new Date(body.startAt),
      clientName: body.clientName,
      clientPhone: body.clientPhone,
      notes: body.notes,
    });
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/bookings failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/bookings",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
