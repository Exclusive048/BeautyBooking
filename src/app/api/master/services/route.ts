import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { createSoloMasterService, upsertMasterServices } from "@/lib/master/profile.service";
import { createMasterServiceSchema, upsertMasterServicesSchema } from "@/lib/master/schemas";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, upsertMasterServicesSchema);
    const data = await upsertMasterServices(masterId, body.items);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/master/services failed", {
        requestId: getRequestId(req),
        route: "PUT /api/master/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, createMasterServiceSchema);
    const data = await createSoloMasterService(masterId, body);
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/services failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
