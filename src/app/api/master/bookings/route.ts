import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { createSoloMasterBooking } from "@/lib/master/manual-booking";
import { createMasterBookingSchema } from "@/lib/master/schemas";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

// 29.09 доработки · 02: списочный `GET` удалён — вызывающих не было (кабинет
// мастера читает записи сервисами `lib/master/bookings.service.ts` и
// `dashboard.service.ts`, уже по суткам салона), а сам он резал дни по UTC.
// Остаётся ручная запись мастера.

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

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
