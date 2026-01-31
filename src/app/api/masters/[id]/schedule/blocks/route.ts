import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
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

export async function POST(
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
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const date = parseISOToUTC(parsed.data.date, "date");

    const result = await addScheduleBlock(p.id, {
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
      logError("POST /api/masters/[id]/schedule/blocks failed", {
        requestId,
        route: "POST /api/masters/{id}/schedule/blocks",
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
    const parsed = removeSchema.safeParse(body);
    if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

    const result = await removeScheduleBlock(p.id, parsed.data.blockId);
    if (!result.ok) return fail(result.message, result.status, result.code);

    return ok({ id: result.data.id });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("DELETE /api/masters/[id]/schedule/blocks failed", {
        requestId,
        route: "DELETE /api/masters/{id}/schedule/blocks",
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

    const blocks = await prisma.scheduleBlock.findMany({
      where: { providerId: p.id, date: { gte: from, lte: to } },
      select: { id: true, date: true, startLocal: true, endLocal: true, reason: true },
      orderBy: { date: "asc" },
    });

    return ok({ blocks });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/masters/[id]/schedule/blocks failed", {
        requestId,
        route: "GET /api/masters/{id}/schedule/blocks",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}
