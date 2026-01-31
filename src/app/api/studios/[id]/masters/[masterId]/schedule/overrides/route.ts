import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { ensureStudioAccess, ensureStudioAdmin } from "@/lib/studios/access";
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

async function ensureStudioViewer(studioId: string, userId: string) {
  return ensureStudioAccess(studioId, userId);
}

async function ensureMasterInStudio(masterId: string, studioId: string) {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, type: true, studioId: true },
  });
  if (!master || master.type !== ProviderType.MASTER || master.studioId !== studioId) {
    return fail("Master not found", 404, "MASTER_NOT_FOUND");
  }
  return null;
}

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const p = params instanceof Promise ? await params : params;
    const accessError = await ensureStudioViewer(p.id, auth.user.id);
    if (accessError) return accessError;
    const masterError = await ensureMasterInStudio(p.masterId, p.id);
    if (masterError) return masterError;

    const url = new URL(req.url);
    const fromRaw = url.searchParams.get("from") ?? "";
    const toRaw = url.searchParams.get("to") ?? "";
    const from = parseISOToUTC(fromRaw, "from");
    const to = parseISOToUTC(toRaw, "to");
    ensureStartNotAfterEnd(from, to, "to");

    const items = await prisma.scheduleOverride.findMany({
      where: { providerId: p.masterId, date: { gte: from, lte: to } },
      select: { date: true, isDayOff: true, startLocal: true, endLocal: true, reason: true },
      orderBy: { date: "asc" },
    });

    const breaks = await prisma.scheduleBreak.findMany({
      where: { providerId: p.masterId, kind: "OVERRIDE", date: { gte: from, lte: to } },
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
      logError("GET /api/studios/[id]/masters/[masterId]/schedule/overrides failed", {
        requestId,
        route: "GET /api/studios/{id}/masters/{masterId}/schedule/overrides",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

export async function PUT(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const p = params instanceof Promise ? await params : params;
    const accessError = await ensureStudioAdmin(p.id, auth.user.id);
    if (accessError) return accessError;
    const masterError = await ensureMasterInStudio(p.masterId, p.id);
    if (masterError) return masterError;

    const body = await req.json().catch(() => null);
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const date = parseISOToUTC(parsed.data.date, "date");

    const result = await setScheduleOverride(p.masterId, {
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
      logError("PUT /api/studios/[id]/masters/[masterId]/schedule/overrides failed", {
        requestId,
        route: "PUT /api/studios/{id}/masters/{masterId}/schedule/overrides",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

export async function DELETE(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const p = params instanceof Promise ? await params : params;
    const accessError = await ensureStudioAdmin(p.id, auth.user.id);
    if (accessError) return accessError;
    const masterError = await ensureMasterInStudio(p.masterId, p.id);
    if (masterError) return masterError;

    const body = await req.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const date = parseISOToUTC(parsed.data.date, "date");

    const result = await removeScheduleOverride(p.masterId, date);
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ date: result.data.date.toISOString() });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("DELETE /api/studios/[id]/masters/[masterId]/schedule/overrides failed", {
        requestId,
        route: "DELETE /api/studios/{id}/masters/{masterId}/schedule/overrides",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
