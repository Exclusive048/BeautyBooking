import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";
import { suggestAddresses } from "@/lib/maps/address-suggest";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(1).max(240),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

export async function GET(req: Request) {
  try {
    // SEC-04: собственный тир — см. комментарий у `addressSuggest` в configs.
    const limit = await checkRateLimit(
      `rl:address:suggest:${getClientIp(req)}`,
      RATE_LIMITS.addressSuggest,
    );
    if (limit.limited) {
      throw new AppError("Слишком много запросов. Попробуйте позже.", 429, "RATE_LIMITED");
    }

    const query = parseQuery(new URL(req.url), querySchema);
    const suggestions = await suggestAddresses({
      query: query.q,
      limit: query.limit ?? 5,
    });
    return jsonOk({ suggestions });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/address/suggest failed", {
        requestId: getRequestId(req),
        route: "GET /api/address/suggest",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
