import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { ensureStudioAccess } from "@/lib/studios/access";
import { setWeeklySchedule } from "@/lib/schedule/usecases";
import type { DayOfWeek } from "@/lib/domain/schedule";

const breakSchema = z.object({
  startLocal: z.string().min(1),
  endLocal: z.string().min(1),
});

const weeklySchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startLocal: z.string().min(1),
    endLocal: z.string().min(1),
    breaks: z.array(breakSchema).max(3).optional(),
  })
);

async function ensureStudioOwner(studioId: string, userId: string) {
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
  _req: Request,
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

  const items = await prisma.weeklySchedule.findMany({
    where: { providerId: p.masterId },
    select: { dayOfWeek: true, startLocal: true, endLocal: true },
    orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
  });

  const breaks = await prisma.scheduleBreak.findMany({
    where: { providerId: p.masterId, kind: "WEEKLY" },
    select: { dayOfWeek: true, startLocal: true, endLocal: true },
    orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
  });

  const breaksByDay = new Map<number, typeof breaks>();
  for (const b of breaks) {
    const key = b.dayOfWeek ?? 0;
    const list = breaksByDay.get(key) ?? [];
    list.push(b);
    breaksByDay.set(key, list);
  }

  const itemsWithBreaks = items.map((item) => ({
    ...item,
    breaks: breaksByDay.get(item.dayOfWeek)?.map((b) => ({
      startLocal: b.startLocal,
      endLocal: b.endLocal,
    })),
  }));

  return ok({ items: itemsWithBreaks });
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
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;
  const masterError = await ensureMasterInStudio(p.masterId, p.id);
  if (masterError) return masterError;

  const body = await req.json().catch(() => null);
  const parsed = weeklySchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const items = parsed.data.map((item) => ({
    ...item,
    dayOfWeek: item.dayOfWeek as DayOfWeek,
  }));

  const result = await setWeeklySchedule(p.masterId, items);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ count: result.data.count });
}
