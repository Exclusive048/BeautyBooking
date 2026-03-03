import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { resolveMasterAccess } from "@/lib/model-offers/access";
import { isTimeWithinRange, proposeTimeSchema } from "@/lib/model-offers/schemas";
import { loadApplicationWithRelations, notifyModelTimeProposed } from "@/lib/notifications/model-notifications";
import { parseBody } from "@/lib/validation";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ applicationId: string }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    const applicationId = params.applicationId;
    if (!applicationId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, proposeTimeSchema);

    const application = await prisma.modelApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        clientUserId: true,
        offer: {
          select: {
            id: true,
            masterId: true,
            dateLocal: true,
            timeRangeStartLocal: true,
            timeRangeEndLocal: true,
            master: { select: { name: true } },
          },
        },
      },
    });
    if (!application) return jsonFail(404, "Application not found", "NOT_FOUND");

    await resolveMasterAccess(application.offer.masterId, user.id);

    if (application.status !== "PENDING") {
      return jsonFail(409, "Application is not pending", "CONFLICT");
    }

    const insideRange = isTimeWithinRange({
      value: body.proposedTimeLocal,
      start: application.offer.timeRangeStartLocal,
      end: application.offer.timeRangeEndLocal,
    });
    if (!insideRange) {
      return jsonFail(400, "Validation error", "TIME_RANGE_INVALID");
    }

    const updated = await prisma.modelApplication.update({
      where: { id: application.id },
      data: {
        status: "APPROVED_WAITING_CLIENT",
        proposedTimeLocal: body.proposedTimeLocal,
      },
      select: { id: true, status: true, proposedTimeLocal: true },
    });

    const fullApplication = await loadApplicationWithRelations(updated.id);
    if (fullApplication) {
      await notifyModelTimeProposed(fullApplication);
    }

    return jsonOk({ application: updated });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/model-applications/[applicationId]/propose-time failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/model-applications/{applicationId}/propose-time",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
