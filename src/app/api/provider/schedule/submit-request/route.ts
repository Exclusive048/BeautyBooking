import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveScheduleProvider } from "@/lib/schedule/provider-access";
import { prisma } from "@/lib/prisma";
import type { SchedulePayload } from "@/lib/schedule/unified";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });

    if (!(provider.type === "MASTER" && provider.studioId)) {
      throw new AppError("Для этого профиля согласование не требуется.", 400, "VALIDATION_ERROR");
    }

    const studio = await prisma.studio.findUnique({
      where: { providerId: provider.studioId },
      select: { id: true },
    });
    if (!studio) {
      throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
    }

    const existing = await prisma.scheduleChangeRequest.findFirst({
      where: { providerId: provider.id, status: "PENDING" },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("Запрос уже находится на согласовании.", 409, "DUPLICATE_REQUEST");
    }

    const body = (await req.json().catch(() => null)) as { payload?: SchedulePayload } | null;
    if (!body || !body.payload) {
      return jsonFail(400, "Некорректное тело запроса.", "INVALID_BODY");
    }

    const created = await prisma.scheduleChangeRequest.create({
      data: {
        studioId: studio.id,
        providerId: provider.id,
        payloadJson: body.payload,
        status: "PENDING",
      },
      select: { id: true },
    });

    return jsonOk({ id: created.id }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/provider/schedule/submit-request failed", {
        requestId: getRequestId(req),
        route: "POST /api/provider/schedule/submit-request",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
