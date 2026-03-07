import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logging/logger";
import { z } from "zod";

export const runtime = "nodejs";

const subscribeBodySchema = z.object({
  endpoint: z.string().trim().min(1),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await req.json().catch(() => null);
    const parsed = subscribeBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("Validation error", 400, "BAD_REQUEST", formatZodError(parsed.error));
    }
    const { endpoint, keys } = parsed.data;
    const { p256dh, auth } = keys;

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
