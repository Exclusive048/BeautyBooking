import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getRequestId, logError } from "@/lib/logging/logger";
import { z } from "zod";

export const runtime = "nodejs";

const unsubscribeBodySchema = z.object({
  endpoint: z.string().trim().min(1),
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await req.json().catch(() => null);
    const parsed = unsubscribeBodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("Validation error", 400, "BAD_REQUEST", formatZodError(parsed.error));
    }
    const { endpoint } = parsed.data;

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
