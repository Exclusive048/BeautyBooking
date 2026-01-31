import { formatZodError } from "@/lib/api/validation";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getProviderProfile } from "@/lib/providers/usecases";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const parsed = providerIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return jsonFail(400, formatZodError(parsed.error), "VALIDATION_ERROR");
    }
    const { id } = parsed.data;

    const provider = await getProviderProfile(id);
    return jsonOk({ provider });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(_req);
    if (appError.status >= 500) {
      logError("GET /api/providers/[id] failed", {
        requestId,
        route: "GET /api/providers/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
