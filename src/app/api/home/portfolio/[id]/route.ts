import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getPortfolioDetail } from "@/lib/feed/portfolio.service";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> | { id: string } };

export async function GET(req: Request, { params }: Props) {
  try {
    const { id } = await Promise.resolve(params);
    const user = await getSessionUser();
    const item = await getPortfolioDetail(id, user?.id);
    return jsonOk({ item });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/home/portfolio/[id] failed", {
        requestId: getRequestId(req),
        route: "GET /api/home/portfolio/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
