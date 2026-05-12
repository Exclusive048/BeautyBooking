import { AccountType, Prisma } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { closeOfferWithCascade } from "@/lib/master/model-offers-mutations";
import { resolveMasterAccess } from "@/lib/model-offers/access";
import { normalizePrice, normalizeRequirements, updateModelOfferSchema } from "@/lib/model-offers/schemas";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";
import { getRequestId, logError } from "@/lib/logging/logger";
import { timeToMinutes } from "@/lib/schedule/time";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export const runtime = "nodejs";

function canAccessMasterOffers(roles: AccountType[]): boolean {
  return roles.some((role) =>
    role === AccountType.MASTER || role === AccountType.STUDIO || role === AccountType.STUDIO_ADMIN
  );
}

function toPriceNumber(value: Prisma.Decimal | null): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function validateTimeRange(start: string, end: string): boolean {
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (startMin === null || endMin === null) return false;
  return startMin < endMin;
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!canAccessMasterOffers(user.roles)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const params = await ctx.params;
    const offerId = params.offerId;
    if (!offerId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, updateModelOfferSchema);
    const offer = await prisma.modelOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        masterId: true,
        status: true,
        timeRangeStartLocal: true,
        timeRangeEndLocal: true,
      },
    });
    if (!offer) return jsonFail(404, "Offer not found", "NOT_FOUND");

    await resolveMasterAccess(offer.masterId, user.id);

    if (body.status && body.status !== "CLOSED" && body.status !== "ARCHIVED") {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    // Distinguish "status-only" updates from full edits. Status changes
    // (close / archive) are always allowed; field edits are blocked the
    // moment any application exists for this offer (29b: clean break — if
    // a master needs to change a published window, they close + create
    // anew so existing applicants get a clear notification).
    const fieldKeys = Object.keys(body).filter((key) => key !== "status");
    const hasFieldEdits = fieldKeys.length > 0;

    if (hasFieldEdits) {
      const anyApplication = await prisma.modelApplication.findFirst({
        where: { offerId: offer.id },
        select: { id: true },
      });
      if (anyApplication) {
        return jsonFail(409, "Offer is locked", "CONFLICT");
      }
    } else {
      // Status-only updates retain the original guard against changing
      // an offer that already has a confirmed booking.
      const hasConfirmed = await prisma.modelApplication.findFirst({
        where: {
          offerId: offer.id,
          OR: [{ status: "CONFIRMED" }, { bookingId: { not: null } }],
        },
        select: { id: true },
      });
      if (hasConfirmed) {
        return jsonFail(409, "Offer is locked", "CONFLICT");
      }
    }

    const nextStart = body.timeRangeStartLocal ?? offer.timeRangeStartLocal;
    const nextEnd = body.timeRangeEndLocal ?? offer.timeRangeEndLocal;
    if (!validateTimeRange(nextStart, nextEnd)) {
      return jsonFail(400, "Validation error", "TIME_RANGE_INVALID");
    }

    // status: CLOSED triggers cascade-reject of pending/approved-waiting
    // applications. Funnels through the shared `closeOfferWithCascade`
    // helper so the dedicated POST /close route shares behaviour.
    if (body.status === "CLOSED" && offer.status !== "CLOSED") {
      await closeOfferWithCascade({ offerId: offer.id, userId: user.id });
    }

    const requirements = body.requirements ? normalizeRequirements(body.requirements) : undefined;
    const priceValue = body.price !== undefined ? normalizePrice(body.price) : undefined;

    const updated = await prisma.modelOffer.update({
      where: { id: offer.id },
      data: {
        ...(body.status && body.status !== "CLOSED" ? { status: body.status } : {}),
        ...(body.timeRangeStartLocal ? { timeRangeStartLocal: body.timeRangeStartLocal } : {}),
        ...(body.timeRangeEndLocal ? { timeRangeEndLocal: body.timeRangeEndLocal } : {}),
        ...(requirements ? { requirements } : {}),
        ...(body.extraBusyMin !== undefined ? { extraBusyMin: body.extraBusyMin } : {}),
        ...(body.price !== undefined
          ? { price: typeof priceValue === "number" ? new Prisma.Decimal(priceValue) : null }
          : {}),
      },
      select: {
        id: true,
        masterId: true,
        dateLocal: true,
        timeRangeStartLocal: true,
        timeRangeEndLocal: true,
        price: true,
        requirements: true,
        extraBusyMin: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonOk({
      offer: {
        id: updated.id,
        masterId: updated.masterId,
        dateLocal: updated.dateLocal,
        timeRangeStartLocal: updated.timeRangeStartLocal,
        timeRangeEndLocal: updated.timeRangeEndLocal,
        price: toPriceNumber(updated.price),
        requirements: updated.requirements,
        extraBusyMin: updated.extraBusyMin,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/master/model-offers/[offerId] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/master/model-offers/{offerId}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
