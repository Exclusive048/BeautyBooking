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
import { getSessionUser, requireRole } from "@/lib/auth/access";
import { ensureStartBeforeEnd, parseISOToUTC } from "@/lib/time";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listProviderBookingsForOwner } from "@/lib/bookings/list";
import { loadBookingWithRelations, notifyBookingConfirmed, notifyBookingCreated } from "@/lib/notifications/booking-notifications";

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
    // AUDIT (HTTP-обвязка создания):
    // - реализовано: API остаётся thin wrapper, бизнес-логика в src/lib/bookings/*.
    // - реализовано: путь без startAtUtc делегирует в createClientBooking (legacy slotLabel-path с вычислением UTC-времени).
    const user = await getSessionUser(req);
    userId = user.userId;
    const roleError = requireRole(user, [AccountType.CLIENT]);
    if (roleError) throw roleError;

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
    } = await parseBody(req, bookingCreateSchema);

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
        clientUserId: user.userId,
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
      return jsonOk({ booking: created }, { status: 201 });
    }

    const booking = await createClientBooking(user.userId, {
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
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
