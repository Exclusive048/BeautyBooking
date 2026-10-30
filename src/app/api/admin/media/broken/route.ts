import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createAdminAuditLogSafe } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getMediaCleanupStats, runMediaCleanup } from "@/lib/media/cleanup";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireAdminAuth();
    if (!auth.ok) return auth.response;

    const stats = await getMediaCleanupStats();
    return ok({ stats });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/admin/media/broken failed", {
        requestId: getRequestId(req),
        route: "GET /api/admin/media/broken",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminAuth();
    if (!auth.ok) return auth.response;

    const cleaned = await runMediaCleanup();
    // Инв. #19: очистка уже прошла по строкам и хранилищу — журнал после неё.
    await createAdminAuditLogSafe({
      adminUserId: auth.user.id,
      action: "MEDIA_CLEANUP_RUN",
      targetType: "media",
      details: { cleaned },
      context: getAdminAuditContext(req),
    });
    const stats = await getMediaCleanupStats();
    return ok({ cleaned, stats });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/admin/media/broken failed", {
        requestId: getRequestId(req),
        route: "POST /api/admin/media/broken",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
