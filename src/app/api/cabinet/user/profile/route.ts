import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import {
  getClientProfile,
  updateClientProfile,
  updateProfileSchema,
} from "@/lib/client-cabinet/profile.service";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseBody } from "@/lib/validation";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const profile = await getClientProfile(user.id);
    return jsonOk(profile);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cabinet/user/profile failed", {
        requestId: getRequestId(req),
        route: "GET /api/cabinet/user/profile",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await parseBody(req, updateProfileSchema);
    const profile = await updateClientProfile(user.id, body);
    return jsonOk(profile);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonFail(409, "Email уже используется", "ALREADY_EXISTS");
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/cabinet/user/profile failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/cabinet/user/profile",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
