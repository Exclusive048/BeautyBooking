import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { getStudioMasterDetails, updateStudioMasterProfile } from "@/lib/studio/masters.service";
import { studioMasterQuerySchema, updateStudioMasterSchema } from "@/lib/studio/schemas";
import { parseBody, parseQuery } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const query = parseQuery(new URL(req.url), studioMasterQuerySchema);

    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN, StudioRole.MASTER],
    });

    const data = await getStudioMasterDetails({ studioId: query.studioId, masterId: params.id });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/masters/[id] failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/masters/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    const body = await parseBody(req, updateStudioMasterSchema);

    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const result = await updateStudioMasterProfile({
      studioId: body.studioId,
      masterId: params.id,
      displayName: body.displayName,
      tagline: body.tagline,
      isActive: body.isActive,
    });
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/studio/masters/[id] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studio/masters/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

