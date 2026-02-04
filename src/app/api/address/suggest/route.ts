import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { suggestAddresses } from "@/lib/maps/address-suggest";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(1).max(240),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

export async function GET(req: Request) {
  try {
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
