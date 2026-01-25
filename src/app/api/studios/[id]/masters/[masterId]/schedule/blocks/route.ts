import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { addScheduleBlock, removeScheduleBlock } from "@/lib/schedule/usecases";

const addSchema = z.object({
  date: z.string().min(1),
  startLocal: z.string().min(1),
  endLocal: z.string().min(1),
  reason: z.string().min(1).optional(),
});

const removeSchema = z.object({
  blockId: z.string().min(1),
});

async function ensureStudioOwner(studioId: string, userId: string) {
  const studio = await prisma.provider.findUnique({
    where: { id: studioId },
    select: { id: true, type: true, ownerUserId: true },
  });
  if (!studio || studio.type !== ProviderType.STUDIO) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }
  if (studio.ownerUserId !== userId) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }
  return null;
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
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;
  const masterError = await ensureMasterInStudio(p.masterId, p.id);
  if (masterError) return masterError;

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from") ?? "";
  const toRaw = url.searchParams.get("to") ?? "";
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail("Invalid date range", 400, "DATE_INVALID");
  }

  const blocks = await prisma.scheduleBlock.findMany({
    where: { providerId: p.masterId, date: { gte: from, lte: to } },
    select: { id: true, date: true, startLocal: true, endLocal: true, reason: true },
    orderBy: { date: "asc" },
  });

  return ok({ blocks });
}

export async function POST(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;
  const masterError = await ensureMasterInStudio(p.masterId, p.id);
  if (masterError) return masterError;

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) return fail("Invalid date", 400, "DATE_INVALID");

  const result = await addScheduleBlock(p.masterId, {
    date,
    startLocal: parsed.data.startLocal,
    endLocal: parsed.data.endLocal,
    reason: parsed.data.reason ?? null,
  });
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ id: result.data.id }, { status: 201 });
}

export async function DELETE(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;
  const masterError = await ensureMasterInStudio(p.masterId, p.id);
  if (masterError) return masterError;

  const body = await req.json().catch(() => null);
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await removeScheduleBlock(p.masterId, parsed.data.blockId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ id: result.data.id });
}
