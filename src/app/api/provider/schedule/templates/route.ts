import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { assertScheduleEditable, resolveScheduleProvider } from "@/lib/schedule/provider-access";
import { createScheduleTemplate, listScheduleTemplates } from "@/lib/schedule/unified";

export const runtime = "nodejs";

function parseTemplateBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("INVALID_BODY");
  }
  const record = body as Record<string, unknown>;
  const name = record.name;
  const startLocal = record.startLocal;
  const endLocal = record.endLocal;
  const breaks = record.breaks;
  const color = record.color;

  if (typeof name !== "string" || typeof startLocal !== "string" || typeof endLocal !== "string") {
    throw new Error("INVALID_BODY");
  }

  return {
    name,
    startLocal,
    endLocal,
    breaks: Array.isArray(breaks)
      ? breaks
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            if (typeof row.startLocal !== "string" || typeof row.endLocal !== "string") return null;
            return { startLocal: row.startLocal, endLocal: row.endLocal };
          })
          .filter((item): item is { startLocal: string; endLocal: string } => Boolean(item))
      : [],
    color: typeof color === "string" ? color : null,
  };
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });

    const templates = await listScheduleTemplates(provider.id);
    return jsonOk({ templates });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_BODY") {
      return jsonFail(400, "Некорректное тело запроса.", "INVALID_BODY");
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/provider/schedule/templates failed", {
        requestId: getRequestId(req),
        route: "GET /api/provider/schedule/templates",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });
    assertScheduleEditable(provider);

    const body = await req.json().catch(() => null);
    const parsed = parseTemplateBody(body);
    const created = await createScheduleTemplate(provider.id, parsed);
    return jsonOk({ id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_BODY") {
      return jsonFail(400, "Некорректное тело запроса.", "INVALID_BODY");
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/provider/schedule/templates failed", {
        requestId: getRequestId(req),
        route: "POST /api/provider/schedule/templates",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
