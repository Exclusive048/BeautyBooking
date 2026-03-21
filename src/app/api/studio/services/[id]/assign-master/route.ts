import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { assignMasterToService } from "@/lib/studio/services.service";
import { assignMasterToServiceSchema } from "@/lib/studio/schemas";
import { parseBody } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, assignMasterToServiceSchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const result = await assignMasterToService({
      studioId: body.studioId,
      serviceId: id,
      masterId: body.masterId,
      isEnabled: body.isEnabled,
    });
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/studio/services/[id]/assign-master failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/services/{id}/assign-master",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

