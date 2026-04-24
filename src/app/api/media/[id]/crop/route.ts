import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { mediaAssetIdParamSchema } from "@/lib/media/schemas";
import { updateMediaCrop } from "@/lib/media/service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const cropSchema = z.object({
  cropX: z.number().min(0).max(1),
  cropY: z.number().min(0).max(1),
  cropWidth: z.number().min(0.01).max(1),
  cropHeight: z.number().min(0.01).max(1),
});

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    const parsedParams = mediaAssetIdParamSchema.safeParse(params);
    if (!parsedParams.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const body = await req.json().catch(() => null);
    const parsedBody = cropSchema.safeParse(body);
    if (!parsedBody.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    const asset = await updateMediaCrop(user, parsedParams.data.id, parsedBody.data);
    return jsonOk({ asset });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("PATCH /api/media/[id]/crop failed", {
        requestId,
        route: "PATCH /api/media/{id}/crop",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
