import { ok, fail } from "@/lib/api/response";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { AccountType } from "@prisma/client";
import { listClientBookings } from "@/lib/bookings/list";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const roleError = requireRole(user, AccountType.CLIENT);
    if (roleError) return roleError;

    const bookings = await listClientBookings(user.id);
    return ok({ bookings });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/bookings/my failed", {
        requestId,
        route: "GET /api/bookings/my",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
