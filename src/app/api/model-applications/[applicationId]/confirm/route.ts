import { AccountType, Prisma } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { confirmApplicationSchema, isTimeWithinRange } from "@/lib/model-offers/schemas";
import {
  loadApplicationWithRelations,
  notifyModelApplicationRejected,
  notifyModelTimeConfirmed,
} from "@/lib/notifications/model-notifications";
import { parseBody } from "@/lib/validation";
import { getRequestId, logError } from "@/lib/logging/logger";
import { dateFromKey, parseTime } from "@/lib/schedule/time";
import { toUtcFromLocalDateTime } from "@/lib/schedule/timezone";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { prisma } from "@/lib/prisma";
import { prismaDirect } from "@/lib/prisma-direct";

type RouteContext = {
  params: Promise<{ applicationId: string }>;
};

export const runtime = "nodejs";

function resolveServiceDuration(input: {
  durationOverrideMin: number | null;
  baseDurationMin: number | null;
  durationMin: number;
}): number {
  return input.durationOverrideMin ?? input.baseDurationMin ?? input.durationMin;
}

function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

async function resolveBufferMinutes(
  providerId: string,
  masterProviderId: string | null,
  providerQuery: Pick<typeof prisma.provider, "findUnique"> = prisma.provider
): Promise<number> {
  if (masterProviderId) {
    const master = await providerQuery.findUnique({
      where: { id: masterProviderId },
      select: { bufferBetweenBookingsMin: true },
    });
    return normalizeBufferMinutes(master?.bufferBetweenBookingsMin);
  }

  const provider = await providerQuery.findUnique({
    where: { id: providerId },
    select: { bufferBetweenBookingsMin: true },
  });
  return normalizeBufferMinutes(provider?.bufferBetweenBookingsMin);
}

function resolveClientName(user: { displayName: string | null; firstName: string | null; phone: string | null }): string {
  return user.displayName?.trim() || user.firstName?.trim() || user.phone?.trim() || "Client";
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!user.roles.includes(AccountType.CLIENT)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const params = await ctx.params;
    const applicationId = params.applicationId;
    if (!applicationId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    await parseBody(req, confirmApplicationSchema);

    // MASTER-MODELS-FIX-A: reason text used for sibling applications
    // cascade-rejected when this client confirms. Mirrors the pattern
    // already used by `closeOfferWithCascade` ("Оффер закрыт") so
    // notifyModelApplicationRejected dispatch stays uniform. Distinct
    // string keeps the client-side UI honest — siblings learn another
    // model was chosen, not that the master actively turned them down.
    const SIBLING_CASCADE_REASON = "Выбран другой отклик";

    const application = await prisma.modelApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        clientUserId: true,
        proposedTimeLocal: true,
        bookingId: true,
        offer: {
          select: {
            id: true,
            status: true,
            dateLocal: true,
            timeRangeStartLocal: true,
            timeRangeEndLocal: true,
            extraBusyMin: true,
            price: true,
            masterId: true,
            master: {
              select: {
                id: true,
                name: true,
                timezone: true,
                ownerUserId: true,
                masterProfile: { select: { userId: true } },
              },
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
                    price: true,
                    basePrice: true,
                    providerId: true,
                    studioId: true,
                  },
                },
              },
            },
            service: {
              select: {
                id: true,
                name: true,
                title: true,
                durationMin: true,
                baseDurationMin: true,
                price: true,
                basePrice: true,
                providerId: true,
                studioId: true,
              },
            },
          },
        },
      },
    });

    if (!application) return jsonFail(404, "Application not found", "NOT_FOUND");
    if (application.clientUserId !== user.id) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    if (application.status === "CONFIRMED" && application.bookingId) {
      return jsonOk({ bookingId: application.bookingId });
    }

    if (application.status !== "APPROVED_WAITING_CLIENT") {
      return jsonFail(409, "Application is not ready", "CONFLICT");
    }

    if (application.offer.status !== "ACTIVE") {
      return jsonFail(409, "Offer is not active", "CONFLICT");
    }

    if (!application.proposedTimeLocal) {
      return jsonFail(409, "Proposed time is missing", "CONFLICT");
    }

    const offerService = application.offer.masterService?.service ?? application.offer.service;
    if (!offerService) {
      return jsonFail(409, "Offer service is missing", "CONFLICT");
    }

    const inRange = isTimeWithinRange({
      value: application.proposedTimeLocal,
      start: application.offer.timeRangeStartLocal,
      end: application.offer.timeRangeEndLocal,
    });
    if (!inRange) {
      return jsonFail(400, "Validation error", "TIME_RANGE_INVALID");
    }

    const date = dateFromKey(application.offer.dateLocal);
    const timeParts = parseTime(application.proposedTimeLocal);
    if (!date || !timeParts) {
      return jsonFail(400, "Validation error", "DATE_INVALID");
    }

    const startAtUtc = toUtcFromLocalDateTime(
      date,
      timeParts.hours,
      timeParts.minutes,
      application.offer.master.timezone
    );

    const durationMin =
      resolveServiceDuration({
        durationOverrideMin: application.offer.masterService?.durationOverrideMin ?? null,
        baseDurationMin: offerService.baseDurationMin ?? null,
        durationMin: offerService.durationMin,
      }) + Math.max(0, application.offer.extraBusyMin ?? 0);

    const endAtUtc = new Date(startAtUtc.getTime() + durationMin * 60 * 1000);
    const slotLabel = `${application.offer.dateLocal} ${application.proposedTimeLocal}`;
    const priceValue = application.offer.price ? Number(application.offer.price) : 0;
    const safePrice = Number.isFinite(priceValue) && priceValue > 0 ? priceValue : 0;

    let siblingCascadeIds: string[] = [];
    const bookingId = await prismaDirect.$transaction(
      async (tx) => {
        const [offerRow, appRow] = await Promise.all([
          tx.modelOffer.findUnique({
            where: { id: application.offer.id },
            select: { status: true },
          }),
          tx.modelApplication.findUnique({
            where: { id: application.id },
            select: { status: true, bookingId: true },
          }),
        ]);

        if (!offerRow || offerRow.status !== "ACTIVE") {
          throw new AppError("Offer is not active", 409, "CONFLICT");
        }
        if (!appRow) {
          throw new AppError("Application not found", 404, "NOT_FOUND");
        }
        if (appRow.status === "CONFIRMED" && appRow.bookingId) {
          return appRow.bookingId;
        }
        if (appRow.status !== "APPROVED_WAITING_CLIENT") {
          throw new AppError("Application is not ready", 409, "CONFLICT");
        }

        const bufferMin = await resolveBufferMinutes(
          offerService.providerId,
          application.offer.masterId,
          tx.provider
        );
        const bufferedStart = bufferMin ? shiftMinutes(startAtUtc, -bufferMin) : startAtUtc;
        const bufferedEnd = bufferMin ? shiftMinutes(endAtUtc, bufferMin) : endAtUtc;

        const conflictWhere = application.offer.masterId
          ? { providerId: offerService.providerId, masterProviderId: application.offer.masterId }
          : { providerId: offerService.providerId };

        const conflicts = await tx.booking.findMany({
          where: {
            ...conflictWhere,
            status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
            startAtUtc: { not: null, lt: bufferedEnd },
            endAtUtc: { not: null, gt: bufferedStart },
          },
          select: { id: true, startAtUtc: true, endAtUtc: true },
          take: 1,
        });

        const conflict = conflicts.find((item) => {
          if (!item.startAtUtc || !item.endAtUtc) return false;
          const itemStart = bufferMin ? shiftMinutes(item.startAtUtc, -bufferMin) : item.startAtUtc;
          const itemEnd = bufferMin ? shiftMinutes(item.endAtUtc, bufferMin) : item.endAtUtc;
          return overlaps(startAtUtc, endAtUtc, itemStart, itemEnd);
        });
        if (conflict) {
          throw new AppError("Time slot is not available", 409, "SLOT_CONFLICT");
        }

        const booking = await tx.booking.create({
          data: {
            providerId: offerService.providerId,
            serviceId: offerService.id,
            masterProviderId: application.offer.masterId,
            masterId: application.offer.masterId,
            startAtUtc,
            endAtUtc,
            slotLabel,
            clientName: resolveClientName(user),
            clientPhone: user.phone?.trim() || "",
            clientNameSnapshot: resolveClientName(user),
            clientPhoneSnapshot: user.phone?.trim() || null,
            clientUserId: user.id,
            status: "CONFIRMED",
            actionRequiredBy: null,
            source: "WEB",
          },
          select: { id: true },
        });

        await tx.bookingServiceItem.create({
          data: {
            bookingId: booking.id,
            studioId: offerService.studioId ?? null,
            serviceId: offerService.id,
            titleSnapshot:
              offerService.title?.trim() ||
              offerService.name,
            priceSnapshot: safePrice,
            durationSnapshotMin: durationMin,
          },
        });

        await tx.modelApplication.update({
          where: { id: application.id },
          data: {
            status: "CONFIRMED",
            confirmedStartAt: startAtUtc,
            bookingId: booking.id,
          },
        });

        // MASTER-MODELS-FIX-A: cascade-reject siblings.
        // Previously the offer flipped to CLOSED but sibling
        // applications were left in stale PENDING /
        // APPROVED_WAITING_CLIENT on a closed offer — they
        // remained as ghost rows for the master (and as
        // "still waiting" for the client). Mirroring the
        // `closeOfferWithCascade` pattern: move them to REJECTED
        // with no `proposedTimeLocal` / `confirmedStartAt`, then
        // fire the existing rejection notification with a neutral
        // reason. REJECTED is the right semantic slot (enum already
        // has it; client UX softens the wording when this REJECTED
        // is a cascade — see `statusMeta` in
        // `client-model-applications-page.tsx`). NO schema
        // migration — Сценарий A in the audit decision.
        const siblings = await tx.modelApplication.findMany({
          where: {
            offerId: application.offer.id,
            id: { not: application.id },
            status: { in: ["PENDING", "APPROVED_WAITING_CLIENT"] },
          },
          select: { id: true },
        });
        if (siblings.length > 0) {
          await tx.modelApplication.updateMany({
            where: { id: { in: siblings.map((row) => row.id) } },
            data: {
              status: "REJECTED",
              proposedTimeLocal: null,
              confirmedStartAt: null,
            },
          });
        }
        siblingCascadeIds = siblings.map((row) => row.id);

        await tx.modelOffer.update({
          where: { id: application.offer.id },
          data: { status: "CLOSED" },
        });

        return booking.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    const fullApplication = await loadApplicationWithRelations(application.id);
    if (fullApplication) {
      await notifyModelTimeConfirmed(fullApplication);
    }

    // MASTER-MODELS-FIX-A: notify cascade-rejected siblings outside
    // the transaction so a flaky notifier doesn't roll the booking
    // back. Same pattern as `closeOfferWithCascade`.
    for (const siblingId of siblingCascadeIds) {
      const sibling = await loadApplicationWithRelations(siblingId);
      if (sibling) {
        await notifyModelApplicationRejected(sibling, SIBLING_CASCADE_REASON);
      }
    }

    await invalidateSlotsForBookingRange({
      providerId: offerService.providerId,
      masterProviderId: application.offer.masterId,
      startAtUtc,
      endAtUtc,
    });

    return jsonOk({ bookingId });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/model-applications/[applicationId]/confirm failed", {
        requestId: getRequestId(req),
        route: "POST /api/model-applications/{applicationId}/confirm",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

