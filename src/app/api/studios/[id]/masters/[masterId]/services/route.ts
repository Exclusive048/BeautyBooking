import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { listMasterServiceOverrides, setMasterServiceOverride } from "@/lib/studios/master-services";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";

const updateSchema = z.object({
  serviceId: z.string().min(1),
  priceOverride: z.number().int().nullable().optional(),
  durationOverrideMin: z.number().int().nullable().optional(),
  isEnabled: z.boolean().optional(),
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const result = await listMasterServiceOverrides(p.id, p.masterId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ overrides: result.data });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; masterId: string }> | { id: string; masterId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const { serviceId, ...input } = parsed.data;
  const result = await setMasterServiceOverride(p.id, p.masterId, serviceId, input);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ override: result.data });
}
