import { z } from "zod";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { parseBody } from "@/lib/validation";
import { parseISOToUTC } from "@/lib/time";
import { createSoloPackageBooking } from "@/lib/bookings/package-booking";
import { findOrCreateGuestUserByPhone } from "@/lib/users/find-or-create-guest";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/auth/otp";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { getClientIp } from "@/lib/http/ip";
import { consentFlagsSchema } from "@/lib/legal/consent-flags";
import { assertRequiredConsents, recordGuestConsents } from "@/lib/legal/consent";

/**
 * PACKAGE-BOOKING-MVP-1 — atomic solo package booking. Mirrors
 * /api/public/bookings: session OR guest-by-phone, two-axis rate limit
 * (fail-closed). The N component slots are validated + created all-or-none
 * by createSoloPackageBooking.
 */
const PACKAGE_BOOK_PHONE_RATE = { limit: 5, windowSeconds: 60 };
const PACKAGE_BOOK_IP_RATE = { limit: 10, windowSeconds: 60 };

const packageBookSchema = z.object({
  clientName: z.string().trim().min(1, "Укажите имя.").max(120),
  clientPhone: z.string().trim().min(1, "Укажите телефон."),
  comment: z.string().trim().max(2000).optional().nullable(),
  silentMode: z.boolean().optional(),
  slots: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        startAtUtc: z.string().trim().min(1),
      }),
    )
    .min(2, "В пакете должно быть минимум 2 услуги.")
    .max(12),
  // RKN-FIX-02 — guest consent (same contract as the single-service routes).
  consent: consentFlagsSchema.optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const requestId = getRequestId(req);
  try {
    const p = params instanceof Promise ? await params : params;
    const body = await parseBody(req, packageBookSchema);

    const phoneNormalized = normalizePhone(body.clientPhone);
    if (!phoneNormalized || phoneNormalized.length < 8) {
      return jsonFail(400, "Проверьте номер телефона.", "VALIDATION_ERROR");
    }

    const phoneKey = `rate:packageBook:phone:${phoneNormalized}`;
    const ipKey = `rate:packageBook:ip:${getClientIp(req)}`;
    const [phoneAllowed, ipAllowed] = await Promise.all([
      checkRateLimit(phoneKey, PACKAGE_BOOK_PHONE_RATE.limit, PACKAGE_BOOK_PHONE_RATE.windowSeconds),
      checkRateLimit(ipKey, PACKAGE_BOOK_IP_RATE.limit, PACKAGE_BOOK_IP_RATE.windowSeconds),
    ]);
    if (!phoneAllowed || !ipAllowed) {
      return jsonFail(429, "Слишком много запросов. Попробуйте позже.", "RATE_LIMITED");
    }

    const slots = body.slots.map((s) => ({
      serviceId: s.serviceId,
      startAtUtc: parseISOToUTC(s.startAtUtc, "startAtUtc"),
    }));

    // Resolve client — prefer session, else guest-by-phone (passive CLIENT).
    let clientUserId: string;
    const session = await getSessionUserFromRequest(req);
    if (session) {
      clientUserId = session.id;
    } else {
      // RKN-FIX-02 — consent before creation, nothing written on refusal.
      assertRequiredConsents(body.consent);

      const { profile, wasCreated } = await findOrCreateGuestUserByPhone({
        phone: body.clientPhone,
        displayName: body.clientName,
      });
      clientUserId = profile.id;
      if (wasCreated) {
        logInfo("package booking · guest profile created", { requestId, userId: profile.id });
      }

      await recordGuestConsents({
        userId: profile.id,
        wasCreated,
        flags: body.consent,
        ipAddress: getClientIp(req),
        userAgent: req.headers.get("user-agent"),
      });
    }

    const result = await createSoloPackageBooking({
      packageId: p.id,
      clientUserId,
      clientName: body.clientName,
      clientPhone: phoneNormalized,
      comment: body.comment ?? null,
      silentMode: body.silentMode ?? false,
      slots,
    });

    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/public/packages/[id]/book failed", {
        requestId,
        route: "POST /api/public/packages/{id}/book",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
