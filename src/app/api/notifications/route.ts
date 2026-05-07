import { formatZodError } from "@/lib/api/validation";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import type { NotificationContext } from "@/lib/notifications/groups";
import { listNotifications } from "@/lib/notifications/service";
import { notificationsQuerySchema } from "@/lib/notifications/schemas";
import { getRequestId, logError } from "@/lib/logging/logger";

function parseContext(value: string | null): NotificationContext | undefined {
  if (value === "master" || value === "personal" || value === "all") return value;
  return undefined;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const url = new URL(req.url);
    const parsed = notificationsQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return jsonFail(400, formatZodError(parsed.error), "VALIDATION_ERROR");
    }

    const context = parseContext(url.searchParams.get("context"));

    const result = await listNotifications({
      userId: user.id,
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit,
      context,
    });

    return jsonOk({ notifications: result.items, nextCursor: result.nextCursor });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/notifications failed", {
        requestId: getRequestId(req),
        route: "GET /api/notifications",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
