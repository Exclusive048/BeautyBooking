import { NextResponse } from "next/server";
import { ProviderType } from "@prisma/client";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { parseBody } from "@/lib/validation";
import { publicBookingCreateSchema } from "@/lib/validation/public-bookings";
import { findOrCreateGuestUserByPhone } from "@/lib/users/find-or-create-guest";
import { createBooking } from "@/lib/bookings/createBooking";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import {
  loadBookingWithRelations,
  notifyBookingConfirmed,
  notifyBookingCreated,
} from "@/lib/notifications/booking-notifications";
import { invalidateRecentMastersCache } from "@/lib/bookings/recent-masters";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureStartBeforeEnd, parseISOToUTC } from "@/lib/time";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { normalizePhone } from "@/lib/auth/otp";
import { prisma } from "@/lib/prisma";

/**
 * Public (no-auth) booking creation endpoint (32b).
 *
 * Authenticated users hit this too — the route reads their session
 * silently and uses session.userId instead of creating a guest, so
 * the widget never has to branch.
 *
 * Guest path auto-creates a passive `CLIENT` UserProfile keyed by
 * normalized phone. Until the SMS gateway is live this is a known
 * spam vector — see BACKLOG → "SMS verification pre-launch blocker".
 * Two-axis rate limit (phone-based + IP-based, fail-closed) mitigates
 * abuse but cannot eliminate it. After OTP login the existing
 * `linkGuestBookingsToUserByPhone` flow stitches records together.
 */
const PUBLIC_BOOKING_PHONE_RATE = { limit: 5, windowSeconds: 60 };
const PUBLIC_BOOKING_IP_RATE = { limit: 10, windowSeconds: 60 };

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = await parseBody(req, publicBookingCreateSchema);

    const idempotencyKeyRaw = req.headers.get("x-idempotency-key");
    const idempotencyKey = idempotencyKeyRaw?.trim() || null;
    if (!idempotencyKey) {
      return jsonFail(400, "Не передан идентификатор запроса.", "VALIDATION_ERROR");
    }

    const phoneNormalized = normalizePhone(body.clientPhone);
    if (!phoneNormalized || phoneNormalized.length < 8) {
      return jsonFail(400, "Проверьте номер телефона.", "VALIDATION_ERROR");
    }

    // Two-axis rate limit — both must pass.
    const phoneKey = `rate:publicBooking:phone:${phoneNormalized}`;
    const ipKey = `rate:publicBooking:ip:${getClientIp(req)}`;
    const [phoneAllowed, ipAllowed] = await Promise.all([
      checkRateLimit(phoneKey, PUBLIC_BOOKING_PHONE_RATE.limit, PUBLIC_BOOKING_PHONE_RATE.windowSeconds),
      checkRateLimit(ipKey, PUBLIC_BOOKING_IP_RATE.limit, PUBLIC_BOOKING_IP_RATE.windowSeconds),
    ]);
    if (!phoneAllowed || !ipAllowed) {
      return jsonFail(429, "Слишком много запросов. Попробуйте позже.", "RATE_LIMITED");
    }

    // Provider sanity check — only allow public booking of published MASTER providers.
    const provider = await prisma.provider.findUnique({
      where: { id: body.providerId },
      select: { id: true, type: true, isPublished: true, studioId: true },
    });
    if (!provider || !provider.isPublished) {
      return jsonFail(404, "Мастер не найден.", "PROVIDER_NOT_FOUND");
    }
    if (provider.type !== ProviderType.MASTER) {
      return jsonFail(400, "Этот мастер принимает записи через студию.", "VALIDATION_ERROR");
    }

    const startAtUtc = parseISOToUTC(body.startAtUtc, "startAtUtc");
    const endAtUtc = parseISOToUTC(body.endAtUtc, "endAtUtc");
    ensureStartBeforeEnd(startAtUtc, endAtUtc);

    // Resolve client identity — prefer session if present.
    let clientUserId: string;
    const session = await getSessionUserFromRequest(req);
    if (session) {
      clientUserId = session.id;
    } else {
      const { profile, wasCreated } = await findOrCreateGuestUserByPhone({
        phone: body.clientPhone,
        displayName: body.clientName,
      });
      clientUserId = profile.id;
      if (wasCreated) {
        logInfo("public booking · guest profile created", {
          requestId,
          userId: profile.id,
        });
      }
    }

    const created = await createBooking({
      providerId: body.providerId,
      serviceId: body.serviceId,
      hotSlotId: body.hotSlotId ?? null,
      masterProviderId: null,
      startAtUtc,
      endAtUtc,
      slotLabel: body.slotLabel,
      clientName: body.clientName,
      clientPhone: phoneNormalized,
      comment: body.comment ?? null,
      silentMode: body.silentMode ?? false,
      referencePhotoAssetId: body.referencePhotoAssetId ?? null,
      bookingAnswers: body.bookingAnswers ?? null,
      clientUserId,
      idempotencyKey,
    });

    try {
      const full = await loadBookingWithRelations(created.id);
      if (full) {
        await notifyBookingCreated(full);
        if (full.status === "CONFIRMED") {
          await notifyBookingConfirmed(full);
        }
      }
    } catch (error) {
      logError("public booking notification failed", {
        requestId,
        bookingId: created.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    void recordSurfaceEvent({
      surface: "bookings",
      outcome: "success",
      operation: "create-public-booking",
    });
    void invalidateRecentMastersCache(clientUserId);

    return jsonOk(
      {
        booking: {
          id: created.id,
          status: created.status,
          slotLabel: created.slotLabel,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/public/bookings failed", {
        requestId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    void recordSurfaceEvent({
      surface: "bookings",
      outcome: appError.code === "BOOKING_CONFLICT" ? "failure" : "failure",
      operation: "create-public-booking",
      code: appError.code,
    });
    return NextResponse.json(
      { ok: false, error: { code: appError.code, message: appError.message } },
      { status: appError.status },
    );
  }
}
