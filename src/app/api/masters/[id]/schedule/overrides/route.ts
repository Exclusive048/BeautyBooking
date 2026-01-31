import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { removeScheduleOverride, setScheduleOverride } from "@/lib/schedule/usecases";
import { ensureStartNotAfterEnd, parseISOToUTC } from "@/lib/time";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

const breakSchema = z.object({
  startLocal: z.string().min(1),
  endLocal: z.string().min(1),
});

const overrideSchema = z.object({
  date: z.string().min(1),
  isDayOff: z.boolean(),
  startLocal: z.string().min(1).optional(),
  endLocal: z.string().min(1).optional(),
  breaks: z.array(breakSchema).max(3).optional(),
  reason: z.string().min(1).optional(),
});

const deleteSchema = z.object({
  date: z.string().min(1),
});

async function ensureMasterOwner(masterId: string, userId: string) {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, type: true, ownerUserId: true },
  });
  if (!master || master.type !== ProviderType.MASTER) {
    return fail("Master not found", 404, "MASTER_NOT_FOUND");
  }
  if (master.ownerUserId !== userId) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const p = params instanceof Promise ? await params : params;
    const accessError = await ensureMasterOwner(p.id, auth.user.id);
    if (accessError) return accessError;

    const body = await req.json().catch(() => null);
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const date = parseISOToUTC(parsed.data.date, "date");

    const result = await setScheduleOverride(p.id, {
      date,
      isDayOff: parsed.data.isDayOff,
      startLocal: parsed.data.startLocal ?? null,
      endLocal: parsed.data.endLocal ?? null,
      breaks: parsed.data.breaks,
      reason: parsed.data.reason ?? null,
    });
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ override: result.data });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("PUT /api/masters/[id]/schedule/overrides failed", {
        requestId,
        route: "PUT /api/masters/{id}/schedule/overrides",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const p = params instanceof Promise ? await params : params;
    const accessError = await ensureMasterOwner(p.id, auth.user.id);
    if (accessError) return accessError;

    const url = new URL(req.url);
    const fromRaw = url.searchParams.get("from") ?? "";
    const toRaw = url.searchParams.get("to") ?? "";
    const from = parseISOToUTC(fromRaw, "from");
    const to = parseISOToUTC(toRaw, "to");
    ensureStartNotAfterEnd(from, to, "to");

    const items = await prisma.scheduleOverride.findMany({
      where: { providerId: p.id, date: { gte: from, lte: to } },
      select: { date: true, isDayOff: true, startLocal: true, endLocal: true, reason: true },
      orderBy: { date: "asc" },
    });

    const breaks = await prisma.scheduleBreak.findMany({
      where: { providerId: p.id, kind: "OVERRIDE", date: { gte: from, lte: to } },
      select: { date: true, startLocal: true, endLocal: true },
      orderBy: [{ date: "asc" }, { startLocal: "asc" }],
    });

    const breaksByDate = new Map<string, typeof breaks>();
    for (const b of breaks) {
      if (!b.date) continue;
      const key = b.date.toISOString().slice(0, 10);
      const list = breaksByDate.get(key) ?? [];
      list.push(b);
      breaksByDate.set(key, list);
    }

    const overrides = items.map((item) => {
      const key = item.date.toISOString().slice(0, 10);
      return {
        ...item,
        breaks: breaksByDate.get(key)?.map((b) => ({ startLocal: b.startLocal, endLocal: b.endLocal })),
      };
    });

    return ok({ overrides });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/masters/[id]/schedule/overrides failed", {
        requestId,
        route: "GET /api/masters/{id}/schedule/overrides",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const p = params instanceof Promise ? await params : params;
    const accessError = await ensureMasterOwner(p.id, auth.user.id);
    if (accessError) return accessError;

    const body = await req.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const date = parseISOToUTC(parsed.data.date, "date");

    const result = await removeScheduleOverride(p.id, date);
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ date: result.data.date.toISOString() });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("DELETE /api/masters/[id]/schedule/overrides failed", {
        requestId,
        route: "DELETE /api/masters/{id}/schedule/overrides",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
