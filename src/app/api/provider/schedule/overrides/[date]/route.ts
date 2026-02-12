import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { assertScheduleEditable, resolveScheduleProvider } from "@/lib/schedule/provider-access";
import { deleteScheduleOverride, upsertScheduleOverride } from "@/lib/schedule/unified";

export const runtime = "nodejs";

function parseOverrideBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("INVALID_BODY");
  }
  const record = body as Record<string, unknown>;
  const type = record.type;
  if (type !== "OFF" && type !== "TIME_RANGE" && type !== "TEMPLATE") {
    throw new Error("INVALID_BODY");
  }

  if (type === "OFF") {
    return { type } as const;
  }

  if (type === "TEMPLATE") {
    if (typeof record.templateId !== "string") throw new Error("INVALID_BODY");
    return {
      type,
      templateId: record.templateId,
      isActive: typeof record.isActive === "boolean" ? record.isActive : true,
    } as const;
  }

  if (typeof record.startLocal !== "string" || typeof record.endLocal !== "string") {
    throw new Error("INVALID_BODY");
  }

  const breaks = record.breaks;
  return {
    type,
    startLocal: record.startLocal,
    endLocal: record.endLocal,
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
  } as const;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ date: string }> | { date: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });
    assertScheduleEditable(provider);

    const p = params instanceof Promise ? await params : params;
    const body = await req.json().catch(() => null);
    const parsed = parseOverrideBody(body);
    await upsertScheduleOverride(provider.id, p.date, parsed);
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_BODY") {
      return jsonFail(400, "Некорректное тело запроса.", "INVALID_BODY");
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/provider/schedule/overrides/[date] failed", {
        requestId: getRequestId(req),
        route: "PUT /api/provider/schedule/overrides/[date]",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ date: string }> | { date: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });
    assertScheduleEditable(provider);

    const p = params instanceof Promise ? await params : params;
    await deleteScheduleOverride(provider.id, p.date);
    return jsonOk({ ok: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/provider/schedule/overrides/[date] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/provider/schedule/overrides/[date]",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
