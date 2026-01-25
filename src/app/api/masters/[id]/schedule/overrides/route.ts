import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { setScheduleOverride } from "@/lib/schedule/usecases";

const overrideSchema = z.object({
  date: z.string().min(1),
  isDayOff: z.boolean(),
  startLocal: z.string().min(1).optional(),
  endLocal: z.string().min(1).optional(),
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
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) return fail("Invalid date", 400, "DATE_INVALID");

  const result = await setScheduleOverride(p.id, {
    date,
    isDayOff: parsed.data.isDayOff,
    startLocal: parsed.data.startLocal ?? null,
    endLocal: parsed.data.endLocal ?? null,
  });
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ override: result.data });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureMasterOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from") ?? "";
  const toRaw = url.searchParams.get("to") ?? "";
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail("Invalid date range", 400, "DATE_INVALID");
  }

  const items = await prisma.scheduleOverride.findMany({
    where: { providerId: p.id, date: { gte: from, lte: to } },
    select: { date: true, isDayOff: true, startLocal: true, endLocal: true },
    orderBy: { date: "asc" },
  });

  return ok({ overrides: items });
}
