import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { ensureStudioAccess, ensureStudioAdmin } from "@/lib/studios/access";
import { addScheduleBlock, removeScheduleBlock } from "@/lib/schedule/usecases";
import { ensureStartNotAfterEnd, parseISOToUTC } from "@/lib/time";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

const addSchema = z.object({
  date: z.string().min(1),
  startLocal: z.string().min(1),
  endLocal: z.string().min(1),
  reason: z.string().min(1).optional(),
});

const removeSchema = z.object({
  blockId: z.string().min(1),
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

    const blocks = await prisma.scheduleBlock.findMany({
      where: { providerId: p.masterId, date: { gte: from, lte: to } },
      select: { id: true, date: true, startLocal: true, endLocal: true, reason: true },
      orderBy: { date: "asc" },
    });

    return ok({ blocks });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/studios/[id]/masters/[masterId]/schedule/blocks failed", {
        requestId,
        route: "GET /api/studios/{id}/masters/{masterId}/schedule/blocks",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

export async function POST(
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
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const date = parseISOToUTC(parsed.data.date, "date");

    const result = await addScheduleBlock(p.masterId, {
      date,
      startLocal: parsed.data.startLocal,
      endLocal: parsed.data.endLocal,
      reason: parsed.data.reason ?? null,
    });
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ id: result.data.id }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/studios/[id]/masters/[masterId]/schedule/blocks failed", {
        requestId,
        route: "POST /api/studios/{id}/masters/{masterId}/schedule/blocks",
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
    const parsed = removeSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const result = await removeScheduleBlock(p.masterId, parsed.data.blockId);
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ id: result.data.id });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("DELETE /api/studios/[id]/masters/[masterId]/schedule/blocks failed", {
        requestId,
        route: "DELETE /api/studios/{id}/masters/{masterId}/schedule/blocks",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
