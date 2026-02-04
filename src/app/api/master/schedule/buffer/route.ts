import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { resolveErrorCode, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { parseBody } from "@/lib/validation";
import { getProviderBuffer, setProviderBuffer } from "@/lib/schedule/usecases";

export const runtime = "nodejs";

const bufferSchema = z.object({
  bufferBetweenBookingsMin: z.number().int().min(0).max(30),
});

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const providerId = await getCurrentMasterProviderId(user.id);
    const result = await getProviderBuffer(providerId);
    if (!result.ok) {
      return jsonFail(result.status, result.message, resolveErrorCode(result.code, "INTERNAL_ERROR"));
    }

    return jsonOk({ bufferBetweenBookingsMin: result.data.bufferBetweenBookingsMin });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/schedule/buffer failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/schedule/buffer",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const providerId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, bufferSchema);
    const result = await setProviderBuffer(providerId, body.bufferBetweenBookingsMin);
    if (!result.ok) {
      return jsonFail(result.status, result.message, resolveErrorCode(result.code, "INTERNAL_ERROR"));
    }

    return jsonOk({ bufferBetweenBookingsMin: result.data.bufferBetweenBookingsMin });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/master/schedule/buffer failed", {
        requestId: getRequestId(req),
        route: "PUT /api/master/schedule/buffer",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
