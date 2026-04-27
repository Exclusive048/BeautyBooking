import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { invalidateStoriesCache } from "@/lib/feed/stories.service";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const rateLimit = await checkRateLimit(
      `rl:/api/master/settings/auto-publish-stories:user:${user.id}`,
      RATE_LIMITS.cabinetMutation,
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const body = await parseBody(req, bodySchema);
    const masterProviderId = await getCurrentMasterProviderId(user.id);

    const updated = await prisma.provider.update({
      where: { id: masterProviderId },
      data: { autoPublishStoriesEnabled: body.enabled },
      select: { id: true, autoPublishStoriesEnabled: true },
    });

    // Fire-and-forget cache invalidation; don't block the response.
    void invalidateStoriesCache();

    return jsonOk({
      id: updated.id,
      autoPublishStoriesEnabled: updated.autoPublishStoriesEnabled,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/master/settings/auto-publish-stories failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/master/settings/auto-publish-stories",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
