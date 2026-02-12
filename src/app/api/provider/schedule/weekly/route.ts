import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { assertScheduleEditable, resolveScheduleProvider } from "@/lib/schedule/provider-access";
import { getWeeklyScheduleConfig, updateWeeklyScheduleConfig } from "@/lib/schedule/unified";

export const runtime = "nodejs";

function parseWeeklyBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("INVALID_BODY");
  }
  const record = body as Record<string, unknown>;
  const days = record.days;
  if (!Array.isArray(days)) {
    throw new Error("INVALID_BODY");
  }

  const parsed = days
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (!Number.isInteger(row.weekday)) return null;
      const templateId = typeof row.templateId === "string" ? row.templateId : null;
      const isActive = Boolean(row.isActive);
      return { weekday: row.weekday as number, templateId, isActive };
    })
    .filter((item): item is { weekday: number; templateId: string | null; isActive: boolean } => Boolean(item));

  return { days: parsed };
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });

    const data = await getWeeklyScheduleConfig(provider.id);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/provider/schedule/weekly failed", {
        requestId: getRequestId(req),
        route: "GET /api/provider/schedule/weekly",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });
    assertScheduleEditable(provider);

    const body = await req.json().catch(() => null);
    const parsed = parseWeeklyBody(body);
    const data = await updateWeeklyScheduleConfig(provider.id, parsed.days);
    return jsonOk(data);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_BODY") {
      return jsonFail(400, "Некорректное тело запроса.", "INVALID_BODY");
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/provider/schedule/weekly failed", {
        requestId: getRequestId(req),
        route: "PUT /api/provider/schedule/weekly",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
