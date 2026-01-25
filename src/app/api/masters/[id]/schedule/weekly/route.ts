import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { setWeeklySchedule } from "@/lib/schedule/usecases";
import type { DayOfWeek } from "@/lib/domain/schedule";

const weeklySchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startLocal: z.string().min(1),
    endLocal: z.string().min(1),
  })
);

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
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = weeklySchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const items = parsed.data.map((item) => ({
    ...item,
    dayOfWeek: item.dayOfWeek as DayOfWeek,
  }));
  const result = await setWeeklySchedule(p.id, items);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ count: result.data.count });
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

  const items = await prisma.weeklySchedule.findMany({
    where: { providerId: p.id },
    select: { dayOfWeek: true, startLocal: true, endLocal: true },
    orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
  });

  return ok({ items });
}
