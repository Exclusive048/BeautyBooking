import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { masterCreateBlockSchema } from "@/lib/master/schemas";
import { deleteMasterBlock, updateMasterBlock } from "@/lib/master/schedule.service";
import { parseBody } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, masterCreateBlockSchema);
    const data = await updateMasterBlock({
      masterId,
      blockId: id,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      type: body.type,
      note: body.note,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/master/blocks/[id] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/master/blocks/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await deleteMasterBlock({ masterId, blockId: id });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/master/blocks/[id] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/master/blocks/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
