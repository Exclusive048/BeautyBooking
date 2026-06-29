import { z } from "zod";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { parseBody } from "@/lib/validation";
import { parseISOToUTC } from "@/lib/time";
import { createStudioPackageBooking } from "@/lib/bookings/package-booking-studio";
import { findOrCreateGuestUserByPhone } from "@/lib/users/find-or-create-guest";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/auth/otp";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";

/**
 * PACKAGE-BOOKING-MVP-2 — atomic studio multi-master package booking. Mirrors
 * the solo /book route: session OR guest-by-phone, two-axis rate limit
 * (fail-closed). Each component carries the client-chosen masterProviderId; the
 * N components are validated + created all-or-none by createStudioPackageBooking.
 */
const PACKAGE_BOOK_PHONE_RATE = { limit: 5, windowSeconds: 60 };
const PACKAGE_BOOK_IP_RATE = { limit: 10, windowSeconds: 60 };

const studioPackageBookSchema = z.object({
  clientName: z.string().trim().min(1, "Укажите имя.").max(120),
  clientPhone: z.string().trim().min(1, "Укажите телефон."),
  comment: z.string().trim().max(2000).optional().nullable(),
  silentMode: z.boolean().optional(),
  selections: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        masterProviderId: z.string().trim().min(1),
        startAtUtc: z.string().trim().min(1),
      }),
    )
    .min(2, "В пакете должно быть минимум 2 услуги.")
    .max(12),
});

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const requestId = getRequestId(req);
  try {
    const p = params instanceof Promise ? await params : params;
    const body = await parseBody(req, studioPackageBookSchema);

    const phoneNormalized = normalizePhone(body.clientPhone);
    if (!phoneNormalized || phoneNormalized.length < 8) {
      return jsonFail(400, "Проверьте номер телефона.", "VALIDATION_ERROR");
    }

    const phoneKey = `rate:studioPackageBook:phone:${phoneNormalized}`;
    const ipKey = `rate:studioPackageBook:ip:${getClientIp(req)}`;
    const [phoneAllowed, ipAllowed] = await Promise.all([
      checkRateLimit(phoneKey, PACKAGE_BOOK_PHONE_RATE.limit, PACKAGE_BOOK_PHONE_RATE.windowSeconds),
      checkRateLimit(ipKey, PACKAGE_BOOK_IP_RATE.limit, PACKAGE_BOOK_IP_RATE.windowSeconds),
    ]);
    if (!phoneAllowed || !ipAllowed) {
      return jsonFail(429, "Слишком много запросов. Попробуйте позже.", "RATE_LIMITED");
    }

    const selections = body.selections.map((s) => ({
      serviceId: s.serviceId,
      masterProviderId: s.masterProviderId,
      startAtUtc: parseISOToUTC(s.startAtUtc, "startAtUtc"),
    }));

    // Resolve client — prefer session, else guest-by-phone (passive CLIENT).
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
        logInfo("studio package booking · guest profile created", { requestId, userId: profile.id });
      }
    }

    const result = await createStudioPackageBooking({
      packageId: p.id,
      clientUserId,
      clientName: body.clientName,
      clientPhone: phoneNormalized,
      comment: body.comment ?? null,
      silentMode: body.silentMode ?? false,
      selections,
    });

    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/public/packages/[id]/studio/book failed", {
        requestId,
        route: "POST /api/public/packages/{id}/studio/book",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
