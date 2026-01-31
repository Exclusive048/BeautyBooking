import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { listProviderBookingsForOwner } from "@/lib/bookings/list";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { requireMasterOwner } from "@/lib/auth/ownership";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const p = params instanceof Promise ? await params : params;
    await requireMasterOwner(auth.user.id, p.id);

    const bookings = await listProviderBookingsForOwner(auth.user.id, p.id);
    return ok({ bookings });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(_req);
    if (appError.status >= 500) {
      logError("GET /api/masters/[id]/bookings failed", {
        requestId,
        route: "GET /api/masters/{id}/bookings",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
