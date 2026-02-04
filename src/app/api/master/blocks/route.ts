import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { masterCreateBlockSchema } from "@/lib/master/schemas";
import { createMasterBlock } from "@/lib/master/schedule.service";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, masterCreateBlockSchema);
    const data = await createMasterBlock({
      masterId,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      type: body.type,
      note: body.note,
    });
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/blocks failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/blocks",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
