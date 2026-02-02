import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { mediaAssetIdParamSchema } from "@/lib/media/schemas";
import { deleteMediaAsset } from "@/lib/media/service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    const parsed = mediaAssetIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const result = await deleteMediaAsset(user, parsed.data.id);
    return jsonOk({ result });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("DELETE /api/media/[id] failed", {
        requestId,
        route: "DELETE /api/media/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
