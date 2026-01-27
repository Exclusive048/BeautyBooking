import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { getProviderBuffer, setProviderBuffer } from "@/lib/schedule/usecases";

const bufferSchema = z.object({
  bufferBetweenBookingsMin: z.number().int().min(0).max(30),
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const result = await getProviderBuffer(p.id);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ bufferBetweenBookingsMin: result.data.bufferBetweenBookingsMin });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = bufferSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await setProviderBuffer(p.id, parsed.data.bufferBetweenBookingsMin);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ bufferBetweenBookingsMin: result.data.bufferBetweenBookingsMin });
}
