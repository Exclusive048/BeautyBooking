import { StudioRole } from "@prisma/client";
import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { unassignMasterFromService } from "@/lib/studio/services.service";
import { parseBody } from "@/lib/validation";

const bodySchema = z.object({
  studioId: z.string().trim().min(1),
  masterId: z.string().trim().min(1),
});

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

    const body = await parseBody(req, bodySchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const result = await unassignMasterFromService({
      studioId: body.studioId,
      serviceId: id,
      masterId: body.masterId,
    });
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/studio/services/[id]/unassign-master failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/services/{id}/unassign-master",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
