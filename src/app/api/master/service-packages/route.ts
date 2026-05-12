import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { createMasterPackage } from "@/lib/master/services-mutations";
import { createMasterPackageSchema } from "@/lib/master/schemas";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const body = await parseBody(req, createMasterPackageSchema);
    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await createMasterPackage(masterId, body);
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/service-packages failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/service-packages",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
