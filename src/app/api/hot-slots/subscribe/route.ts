import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { parseBody } from "@/lib/validation";
import { hotSlotSubscriptionSchema } from "@/lib/hot-slots/schemas";
import {
  listHotSlotSubscriptions,
  subscribeHotSlots,
  unsubscribeHotSlots,
} from "@/lib/hot-slots/subscriptions";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const items = await listHotSlotSubscriptions(user.id);
    return jsonOk({ items });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/hot-slots/subscribe failed", {
        requestId: getRequestId(req),
        route: "GET /api/hot-slots/subscribe",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await parseBody(req, hotSlotSubscriptionSchema);
    await subscribeHotSlots(user.id, body.providerId);
    return jsonOk({ ok: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/hot-slots/subscribe failed", {
        requestId: getRequestId(req),
        route: "POST /api/hot-slots/subscribe",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await parseBody(req, hotSlotSubscriptionSchema);
    await unsubscribeHotSlots(user.id, body.providerId);
    return jsonOk({ ok: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/hot-slots/subscribe failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/hot-slots/subscribe",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
