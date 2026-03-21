import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { loadInviteWithRelations, notifyStudioInviteReceived } from "@/lib/notifications/studio-notifications";
import { ensureStudioRole } from "@/lib/studio/access";
import { createStudioMasterSchema, studioServicesQuerySchema } from "@/lib/studio/schemas";
import { createStudioMaster, listStudioMasters } from "@/lib/studio/masters.service";
import { parseBody, parseQuery } from "@/lib/validation";
import { ensureStudioTeamLimit } from "@/lib/studio/team-limits";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), studioServicesQuerySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const data = await listStudioMasters(query.studioId);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/masters failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/masters",
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

    const body = await parseBody(req, createStudioMasterSchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    await ensureStudioTeamLimit(user.id, body.studioId);

    const data = await createStudioMaster({
      ...body,
      invitedByUserId: user.id,
    });

    if (data.shouldNotifyInvite) {
      try {
        const invite = await loadInviteWithRelations(data.inviteId);
        if (invite) {
          await notifyStudioInviteReceived(invite);
        }
      } catch (notifyError) {
        logError("POST /api/studio/masters invite notification failed", {
          requestId: getRequestId(req),
          route: "POST /api/studio/masters",
          stack: notifyError instanceof Error ? notifyError.stack : undefined,
        });
      }
    }

    return jsonOk({ id: data.id }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/studio/masters failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/masters",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
