import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = (await req.json().catch(() => null)) as SubscribeBody | null;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth.trim() : "";

    if (!endpoint || !p256dh || !auth) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: user.id,
        p256dh,
        auth,
      },
      create: {
        userId: user.id,
        endpoint,
        p256dh,
        auth,
      },
    });

    return jsonOk({ subscribed: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/notifications/push/subscribe failed", {
        requestId: getRequestId(req),
        route: "POST /api/notifications/push/subscribe",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
