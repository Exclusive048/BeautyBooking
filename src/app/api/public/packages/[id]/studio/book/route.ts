import { z } from "zod";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { parseBody } from "@/lib/validation";
import { parseISOToUTC } from "@/lib/time";
import { createStudioPackageBooking } from "@/lib/bookings/package-booking-studio";
import { findOrCreateGuestUserByPhone } from "@/lib/users/find-or-create-guest";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { issueGuestManagePath } from "@/lib/bookings/guest-manage";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";
import { getRequestId, logError, logInfo } from "@/lib/logging/logger";
import { getClientIp } from "@/lib/http/ip";
import { consentFlagsSchema } from "@/lib/legal/consent-flags-schema";
import { assertRequiredConsents, recordGuestConsents } from "@/lib/legal/consent";

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
  // RKN-FIX-02 — guest consent (same contract as the other booking routes).
  consent: consentFlagsSchema.optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const requestId = getRequestId(req);
  try {
    const p = params instanceof Promise ? await params : params;
    const body = await parseBody(req, studioPackageBookSchema);

    const idempotencyKey = req.headers.get("x-idempotency-key")?.trim() || null;

    // LOGIC-30: форма телефона, а не только длина. Порог «≥ 8 символов»
    // пропускал строки, телефоном не являющиеся, — а телефон здесь ключ
    // склейки гостевых броней, namespace идемпотентности и рейт-лимита, и
    // мусор в нём дороже обычной валидационной небрежности. Нормализатор тот
    // же, что у склейки и CRM-ключа, поэтому «8 999…» приводится к
    // каноническому «+7999…», а не сохраняется как «+8999…» (профиль с таким
    // телефоном недостижим навсегда).
    const phoneNormalized = normalizeRussianPhone(body.clientPhone);
    if (!phoneNormalized) {
      return jsonFail(400, "Проверьте номер телефона.", "VALIDATION_ERROR");
    }

    const phoneKey = routeRateLimitKey(req, "phone", phoneNormalized);
    const ipKey = routeRateLimitKey(req, "ip", getClientIp(req));
    // FIX-C11: причина отказа различима — 503 при обрыве, 429 при бюджете.
    const [phoneLimit, ipLimit] = await Promise.all([
      checkRateLimit(phoneKey, {
        maxRequests: PACKAGE_BOOK_PHONE_RATE.limit,
        windowSeconds: PACKAGE_BOOK_PHONE_RATE.windowSeconds,
      }),
      checkRateLimit(ipKey, {
        maxRequests: PACKAGE_BOOK_IP_RATE.limit,
        windowSeconds: PACKAGE_BOOK_IP_RATE.windowSeconds,
      }),
    ]);
    const refusal = resolveRateLimitRefusal(phoneLimit, ipLimit);
    if (refusal) {
      return jsonFail(refusal.status, refusal.message, refusal.code);
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
      // RKN-FIX-02 — consent before creation, nothing written on refusal.
      assertRequiredConsents(body.consent);

      const { profile, wasCreated } = await findOrCreateGuestUserByPhone({
        phone: body.clientPhone,
        displayName: body.clientName,
      });
      clientUserId = profile.id;
      if (wasCreated) {
        logInfo("studio package booking · guest profile created", { requestId, userId: profile.id });
      }

      await recordGuestConsents({
        userId: profile.id,
        wasCreated,
        flags: body.consent,
        ipAddress: getClientIp(req),
        userAgent: req.headers.get("user-agent"),
      });
    }

    const result = await createStudioPackageBooking({
      packageId: p.id,
      clientUserId,
      clientName: body.clientName,
      clientPhone: phoneNormalized,
      comment: body.comment ?? null,
      silentMode: body.silentMode ?? false,
      selections,
      // LOGIC-09 (инв. #28): повторный сабмит обязан вернуть ТОТ ЖЕ пакет, а не
      // «это время занято» — так выглядел двойной клик, потому что второй
      // запрос упирался в уже созданные сиблинги. Заголовок опционален:
      // требовать его — ломать контракт публичного роута для существующих
      // клиентов, а не чинить находку.
      idempotencyKey,
    });

    // GUEST-MANAGE-LINK: гостю — ссылка «Управлять записью» на весь пакет.
    const firstBookingId = result.bookingIds[0];
    const manageUrl =
      session || !firstBookingId ? null : await issueGuestManagePath(firstBookingId, clientUserId);

    return jsonOk({ ...result, manageUrl });
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
