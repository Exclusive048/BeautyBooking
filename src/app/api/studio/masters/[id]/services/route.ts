import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { bulkMasterServicesSchema } from "@/lib/studio/schemas";
import { bulkUpdateMasterServices } from "@/lib/studio/masters.service";
import { parseBody } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function PUT(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const body = await parseBody(req, bulkMasterServicesSchema);

    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const result = await bulkUpdateMasterServices({
      studioId: body.studioId,
      masterId: params.id,
      items: body.items,
    });
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/studio/masters/[id]/services failed", {
        requestId: getRequestId(req),
        route: "PUT /api/studio/masters/{id}/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

