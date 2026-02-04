import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import {
  deleteStudioBlockSchema,
  studioServicesQuerySchema,
  updateStudioBlockSchema,
} from "@/lib/studio/schemas";
import { deleteStudioBlock, updateStudioBlock } from "@/lib/studio/calendar.service";
import { parseBody, parseQuery } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const body = await parseBody(req, updateStudioBlockSchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const data = await updateStudioBlock({
      studioId: body.studioId,
      blockId: id,
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
      type: body.type,
      note: body.note,
    });
    return jsonOk({ block: data });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/studio/blocks/[id] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studio/blocks/{id}",
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
    const parsed = parseQuery(new URL(req.url), studioServicesQuerySchema);
    const payload = deleteStudioBlockSchema.parse({ studioId: parsed.studioId });
    await ensureStudioRole({
      studioId: payload.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const data = await deleteStudioBlock({
      studioId: payload.studioId,
      blockId: id,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/studio/blocks/[id] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/studio/blocks/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
