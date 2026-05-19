import { StudioRole } from "@prisma/client";
import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { updateMasterPackageSchema } from "@/lib/master/schemas";
import {
  deleteMasterPackage,
  updateMasterPackage,
} from "@/lib/master/services-mutations";
import { prisma } from "@/lib/prisma";
import { ensureStudioRole } from "@/lib/studio/access";
import { parseBody, parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = updateMasterPackageSchema.and(
  z.object({ studioId: z.string().trim().min(1) }),
);

const deleteQuerySchema = z.object({ studioId: z.string().trim().min(1) });

async function studioProviderId(studioId: string): Promise<string | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { providerId: true },
  });
  return studio?.providerId ?? null;
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, patchBodySchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const providerId = await studioProviderId(body.studioId);
    if (!providerId) return jsonFail(404, "Studio not found", "STUDIO_NOT_FOUND");

    const { studioId: _studioId, ...mutationInput } = body;
    void _studioId;

    const data = await updateMasterPackage(providerId, id, mutationInput);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/studio/service-packages/[id] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studio/service-packages/{id}",
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

    const query = parseQuery(new URL(req.url), deleteQuerySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const providerId = await studioProviderId(query.studioId);
    if (!providerId) return jsonFail(404, "Studio not found", "STUDIO_NOT_FOUND");

    const data = await deleteMasterPackage(providerId, id);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/studio/service-packages/[id] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/studio/service-packages/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
