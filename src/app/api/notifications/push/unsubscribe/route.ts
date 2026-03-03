import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

type UnsubscribeBody = {
  endpoint?: unknown;
};

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = (await req.json().catch(() => null)) as UnsubscribeBody | null;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: user.id },
    });

    return jsonOk({ unsubscribed: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/notifications/push/unsubscribe failed", {
        requestId: getRequestId(req),
        route: "POST /api/notifications/push/unsubscribe",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
