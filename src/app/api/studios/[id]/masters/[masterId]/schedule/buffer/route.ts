import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { getProviderBuffer, setProviderBuffer } from "@/lib/schedule/usecases";

const bufferSchema = z.object({
  bufferBetweenBookingsMin: z.number().int().min(0).max(30),
});

async function ensureStudioViewer(studioId: string, userId: string) {
  return ensureStudioAdmin(studioId, userId);
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
  _req: Request,
  {
    params,
  }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioViewer(p.id, auth.user.id);
  if (accessError) return accessError;
  const masterError = await ensureMasterInStudio(p.masterId, p.id);
  if (masterError) return masterError;

  const result = await getProviderBuffer(p.masterId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ bufferBetweenBookingsMin: result.data.bufferBetweenBookingsMin });
}

export async function PUT(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAdmin(p.id, auth.user.id);
  if (accessError) return accessError;
  const masterError = await ensureMasterInStudio(p.masterId, p.id);
  if (masterError) return masterError;

  const body = await req.json().catch(() => null);
  const parsed = bufferSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await setProviderBuffer(p.masterId, parsed.data.bufferBetweenBookingsMin);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ bufferBetweenBookingsMin: result.data.bufferBetweenBookingsMin });
}
