import { ok, fail } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { getStudioPortfolioAttribution } from "@/lib/studios/portfolio-items";

/**
 * STUDIO-PORTFOLIO-FEED — подписи фото портфолио студии («мастер · услуга») и
 * из кого/чего выбирать. `[id]` — `Provider.id` студии (SEC-28).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const accessError = await ensureStudioAdmin(id, auth.user.id);
  if (accessError) return accessError;

  try {
    return ok(await getStudioPortfolioAttribution(id));
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studios/[id]/portfolio failed", {
        requestId: getRequestId(req),
        route: "GET /api/studios/{id}/portfolio",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
