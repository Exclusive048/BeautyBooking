import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { setStudioPortfolioAttribution } from "@/lib/studios/portfolio-items";
import { parseBody } from "@/lib/validation";

const attributionSchema = z.object({
  performerId: z.string().trim().min(1).max(64).nullable(),
  serviceId: z.string().trim().min(1).max(64).nullable(),
});

/**
 * STUDIO-PORTFOLIO-FEED — подпись фото студии: кто из мастеров студии делал
 * работу и какую услугу. Показывается на фото в ленте и в историях.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { id, assetId } = await ctx.params;
  const accessError = await ensureStudioAdmin(id, auth.user.id);
  if (accessError) return accessError;

  try {
    const body = await parseBody(req, attributionSchema);
    const item = await setStudioPortfolioAttribution({
      studioProviderId: id,
      assetId,
      performerId: body.performerId,
      serviceId: body.serviceId,
    });
    return ok({ item });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/studios/[id]/portfolio/[assetId] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studios/{id}/portfolio/{assetId}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
