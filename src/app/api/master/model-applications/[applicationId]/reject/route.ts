import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { resolveMasterAccess } from "@/lib/model-offers/access";
import { rejectApplicationSchema } from "@/lib/model-offers/schemas";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
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

    await parseBody(req, rejectApplicationSchema);

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

    if (application.status === "CONFIRMED") {
      return jsonFail(409, "Application already confirmed", "CONFLICT");
    }

    const updated = await prisma.modelApplication.update({
      where: { id: application.id },
      data: {
        status: "REJECTED",
        proposedTimeLocal: null,
        confirmedStartAt: null,
      },
      select: { id: true, status: true },
    });

    if (application.clientUserId) {
      const notification = await createNotification({
        userId: application.clientUserId,
        type: "MODEL_APPLICATION_REJECTED",
        title: "Заявка отклонена",
        body: "Мастер отклонил вашу заявку на модельное предложение.",
        payloadJson: {
          offerId: application.offer.id,
          applicationId: application.id,
        },
      });
      publishNotifications([notification]);
    }

    return jsonOk({ application: { id: updated.id, status: updated.status } });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/model-applications/[applicationId]/reject failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/model-applications/{applicationId}/reject",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
