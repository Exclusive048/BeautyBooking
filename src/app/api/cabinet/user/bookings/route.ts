import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import {
  listClientBookings,
  type ClientBookingFilter,
} from "@/lib/client-cabinet/bookings.service";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

function parseStatus(value: string | null): ClientBookingFilter["status"] {
  if (value === "upcoming" || value === "finished" || value === "cancelled" || value === "all") {
    return value;
  }
  return "all";
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const url = new URL(req.url);
    const filter: ClientBookingFilter = {
      status: parseStatus(url.searchParams.get("status")),
      search: url.searchParams.get("search")?.trim() || undefined,
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
    };

    const payload = await listClientBookings(user.id, filter);
    return jsonOk(payload);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cabinet/user/bookings failed", {
        requestId: getRequestId(req),
        route: "GET /api/cabinet/user/bookings",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
