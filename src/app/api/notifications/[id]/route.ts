import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { setNotificationRead } from "@/lib/notifications/service";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  isRead: z.boolean(),
});

/**
 * Bi-directional read flag toggle. The legacy `/api/notifications/[id]/read`
 * endpoint only marked unread → read; this lets the user flip back. Both
 * endpoints coexist — the read-only POST is kept for SSE / existing
 * notification-center consumers.
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, patchSchema);
    const result = await setNotificationRead(id, user.id, body.isRead);
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/notifications/[id] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/notifications/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
