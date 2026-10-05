import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { createStudioServiceSchema, studioServicesQuerySchema } from "@/lib/studio/schemas";
import { createStudioService, getStudioServices } from "@/lib/studio/services.service";
import { ensureStudioOnlinePaymentsAllowed } from "@/lib/studio/online-payments-gate";
import { parseBody, parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), studioServicesQuerySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const data = await getStudioServices(query.studioId);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/services failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const body = await parseBody(req, createStudioServiceSchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    // MOBILE-STUDIO-C: онлайн-оплата при создании — тот же гейт, что у PATCH.
    if (body.onlinePaymentEnabled === true) {
      await ensureStudioOnlinePaymentsAllowed(user.id);
    }

    const data = await createStudioService({
      ...body,
      proposerUserId: user.id,
    });
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/studio/services failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
