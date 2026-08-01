import { formatZodError } from "@/lib/api/validation";
import { bookingsQuerySchema } from "@/lib/bookings/schemas";
import { requireAuth } from "@/lib/auth/guards";
import { createClientBooking } from "@/lib/bookings/createClientBooking";
import { createBooking } from "@/lib/bookings/createBooking";
import { AccountType } from "@prisma/client";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { parseBody } from "@/lib/validation";
import { bookingCreateSchema } from "@/lib/validation/bookings";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/guards";
import { ensureStartBeforeEnd, parseISOToUTC } from "@/lib/time";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listProviderBookingsForOwner } from "@/lib/bookings/list";
import { loadBookingWithRelations, notifyBookingConfirmed, notifyBookingCreated } from "@/lib/notifications/booking-notifications";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { invalidateRecentMastersCache } from "@/lib/bookings/recent-masters";
import { assertRequiredConsents, recordGuestConsents } from "@/lib/legal/consent";
import { findOrCreateGuestUserByPhone } from "@/lib/users/find-or-create-guest";
import { getClientIp } from "@/lib/http/ip";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const url = new URL(req.url);
    const parsed = bookingsQuerySchema.safeParse({
      providerId: url.searchParams.get("providerId"),
    });
    if (!parsed.success) {
      return jsonFail(400, formatZodError(parsed.error), "VALIDATION_ERROR");
    }
    const { providerId } = parsed.data;

    const bookings = await listProviderBookingsForOwner(user.id, providerId);
    return jsonOk({ bookings });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/bookings failed", {
        requestId,
        route: "GET /api/bookings",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}

export async function POST(req: Request) {
  let userId: string | undefined;
  try {
    // BOOKING-WIDGET-FOUNDATION-A: anonymous (guest) bookings allowed.
    // If session present → must be CLIENT (preserve original behaviour:
    // MASTER/STUDIO/ADMIN can't book through this endpoint). If no
    // session → guest path: clientUserId=null, identity carried via
    // clientPhone + clientName. Post-signup linking handled by
    // `linkGuestBookingsToUserByPhone`.
    const sessionUser = await getSessionUserFromRequest(req);
    if (sessionUser) {
      if (!hasAnyRole(sessionUser, [AccountType.CLIENT])) {
        return jsonFail(403, "Forbidden", "FORBIDDEN");
      }
      userId = sessionUser.id;
    }

    const {
      providerId,
      serviceId,
      hotSlotId,
      masterProviderId,
      startAtUtc: startAtUtcRaw,
      endAtUtc: endAtUtcRaw,
      slotLabel,
      clientName,
      clientPhone,
      comment,
      silentMode,
      referencePhotoAssetId,
      bookingAnswers,
      consent,
    } = await parseBody(req, bookingCreateSchema);

    // RKN-FIX-02 — the public STUDIO booking flow posts guest bookings here
    // (`features/booking/lib/studio-booking.ts`), so this endpoint is a real
    // guest surface, not just the mobile contract. Two things follow:
    //
    //  1. consent is required before anything is created (implied consent is
    //     void since 01.09.2025), and
    //  2. the guest gets the same passive profile the other guest endpoints
    //     create — consent proof needs a subject to attach to, and
    //     `clientUserId: null` gave it none. This converges the endpoint on
    //     what `/api/public/bookings` has always done; the end state was
    //     already identical, since `linkGuestBookingsToUserByPhone` attached
    //     these bookings to the very same phone-keyed profile at the guest's
    //     next login.
    let effectiveClientUserId: string | null = sessionUser?.id ?? null;
    if (!sessionUser) {
      assertRequiredConsents(consent);

      const { profile, wasCreated } = await findOrCreateGuestUserByPhone({
        phone: clientPhone,
        displayName: clientName,
      });
      effectiveClientUserId = profile.id;

      await recordGuestConsents({
        userId: profile.id,
        wasCreated,
        flags: consent,
        ipAddress: getClientIp(req),
        userAgent: req.headers.get("user-agent"),
      });
    }

    const idempotencyKeyRaw = req.headers.get("x-idempotency-key");
    const idempotencyKey = idempotencyKeyRaw ? idempotencyKeyRaw.trim() : "";
    const normalizedIdempotencyKey = idempotencyKey.length > 0 ? idempotencyKey : null;

    const startAtUtc = startAtUtcRaw ? parseISOToUTC(startAtUtcRaw, "startAtUtc") : null;
    const endAtUtc = endAtUtcRaw ? parseISOToUTC(endAtUtcRaw, "endAtUtc") : null;
    if (startAtUtc && endAtUtc) {
      ensureStartBeforeEnd(startAtUtc, endAtUtc);
    }
    if (startAtUtc) {
      const created = await createBooking({
        providerId,
        serviceId,
        hotSlotId: hotSlotId ?? null,
        masterProviderId: masterProviderId ?? null,
        startAtUtc,
        endAtUtc: endAtUtc ?? null,
        slotLabel,
        clientName,
        clientPhone,
        comment,
        silentMode,
        referencePhotoAssetId,
        bookingAnswers,
        clientUserId: effectiveClientUserId,
        idempotencyKey: normalizedIdempotencyKey,
      });
      try {
        const fullBooking = await loadBookingWithRelations(created.id);
        if (fullBooking) {
          await notifyBookingCreated(fullBooking);
          if (fullBooking.status === "CONFIRMED") {
            await notifyBookingConfirmed(fullBooking);
          }
        }
      } catch (error) {
        logError("POST /api/bookings notifications failed", {
          requestId: getRequestId(req),
          route: "POST /api/bookings",
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      void recordSurfaceEvent({
        surface: "bookings",
        outcome: "success",
        operation: "create-booking",
      });
      if (effectiveClientUserId) {
        void invalidateRecentMastersCache(effectiveClientUserId);
      }
      return jsonOk({ booking: created }, { status: 201 });
    }

    // Legacy slotLabel-only path still requires a signed-in user
    // because `createClientBooking` was not adapted for guests in this
    // commit (scope: foundation only). The booking widget always sends
    // startAtUtc/endAtUtc so this branch isn't reached in practice.
    // RKN-FIX-02: the guard now keys off the SESSION, not off
    // `effectiveClientUserId` — a guest resolves to a passive profile id since
    // this change, which would otherwise have let a guest slip into a path
    // that was never adapted for them.
    if (!sessionUser) {
      return jsonFail(400, "startAtUtc/endAtUtc обязательны для гостевой брони.", "VALIDATION_ERROR");
    }

    const booking = await createClientBooking(sessionUser.id, {
      providerId,
      serviceId,
      hotSlotId: hotSlotId ?? null,
      slotLabel,
      clientName,
      clientPhone,
      comment,
      silentMode,
      referencePhotoAssetId,
      bookingAnswers,
    }, normalizedIdempotencyKey);
    try {
      const fullBooking = await loadBookingWithRelations(booking.id);
      if (fullBooking) {
        await notifyBookingCreated(fullBooking);
        if (fullBooking.status === "CONFIRMED") {
          await notifyBookingConfirmed(fullBooking);
        }
      }
    } catch (error) {
      logError("POST /api/bookings notifications failed", {
        requestId: getRequestId(req),
        route: "POST /api/bookings",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    void recordSurfaceEvent({
      surface: "bookings",
      outcome: "success",
      operation: "create-booking",
    });
    if (effectiveClientUserId) {
      void invalidateRecentMastersCache(effectiveClientUserId);
    }
    return jsonOk({ booking }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/bookings failed", {
        requestId,
        route: "POST /api/bookings",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    void recordSurfaceEvent({
      surface: "bookings",
      outcome: appError.status === 401 || appError.status === 403 ? "denied" : "failure",
      operation: "create-booking",
      code: appError.code,
    });
    const response = jsonFail(appError.status, appError.message, appError.code);
    if (appError.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}
