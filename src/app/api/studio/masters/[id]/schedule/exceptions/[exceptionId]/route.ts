import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { deleteStudioWorkException } from "@/lib/studio/master-schedule.service";
import { deleteWorkExceptionSchema } from "@/lib/studio/schemas";
import { parseQuery } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string; exceptionId: string }>;
};

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const { id, exceptionId } = await ctx.params;
    if (!id || !exceptionId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const query = parseQuery(
      new URL(req.url),
      deleteWorkExceptionSchema
    );
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const data = await deleteStudioWorkException({
      studioId: query.studioId,
      masterId: id,
      exceptionId,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/studio/masters/[id]/schedule/exceptions/[exceptionId] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/studio/masters/{id}/schedule/exceptions/{exceptionId}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
