import { AccountType, Prisma } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function toPriceNumber(value: Prisma.Decimal | null): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function resolveServiceDuration(input: {
  durationOverrideMin: number | null;
  baseDurationMin: number | null;
  durationMin: number;
}): number {
  return input.durationOverrideMin ?? input.baseDurationMin ?? input.durationMin;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!user.roles.includes(AccountType.CLIENT)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const applications = await prisma.modelApplication.findMany({
      where: { clientUserId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        clientNote: true,
        proposedTimeLocal: true,
        confirmedStartAt: true,
        bookingId: true,
        createdAt: true,
        offer: {
          select: {
            id: true,
            status: true,
            dateLocal: true,
            timeRangeStartLocal: true,
            timeRangeEndLocal: true,
            price: true,
            requirements: true,
            extraBusyMin: true,
            master: {
              select: { id: true, name: true, avatarUrl: true, publicUsername: true },
            },
            masterService: {
              select: {
                id: true,
                durationOverrideMin: true,
                service: {
                  select: {
                    id: true,
                    name: true,
                    title: true,
                    durationMin: true,
                    baseDurationMin: true,
                    category: { select: { title: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const items = applications.map((item) => {
      const service = item.offer.masterService.service;
      const durationMin = resolveServiceDuration({
        durationOverrideMin: item.offer.masterService.durationOverrideMin ?? null,
        baseDurationMin: service.baseDurationMin ?? null,
        durationMin: service.durationMin,
      });

      return {
        id: item.id,
        status: item.status,
        clientNote: item.clientNote,
        proposedTimeLocal: item.proposedTimeLocal,
        confirmedStartAt: item.confirmedStartAt ? item.confirmedStartAt.toISOString() : null,
        bookingId: item.bookingId,
        createdAt: item.createdAt.toISOString(),
        offer: {
          id: item.offer.id,
          status: item.offer.status,
          dateLocal: item.offer.dateLocal,
          timeRangeStartLocal: item.offer.timeRangeStartLocal,
          timeRangeEndLocal: item.offer.timeRangeEndLocal,
          price: toPriceNumber(item.offer.price),
          requirements: item.offer.requirements,
          extraBusyMin: item.offer.extraBusyMin,
          master: {
            id: item.offer.master.id,
            name: item.offer.master.name,
            avatarUrl: item.offer.master.avatarUrl ?? null,
            publicUsername: item.offer.master.publicUsername ?? null,
          },
          service: {
            id: service.id,
            title: service.title?.trim() || service.name,
            categoryTitle: service.category?.title ?? null,
            durationMin,
          },
        },
      };
    });

    return jsonOk({ applications: items });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/me/model-applications failed", {
        requestId: getRequestId(req),
        route: "GET /api/me/model-applications",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
