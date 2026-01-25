import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { attachMasterToStudio, detachMasterFromStudio, listStudioMasters } from "@/lib/studios/masters";
import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";

const attachSchema = z.object({
  masterProviderId: z.string().min(1),
});

const detachSchema = z.object({
  masterProviderId: z.string().min(1),
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
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const result = await listStudioMasters(p.id);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ masters: result.data });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = attachSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await attachMasterToStudio(p.id, parsed.data.masterProviderId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ master: result.data }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioOwner(p.id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsed = detachSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const result = await detachMasterFromStudio(p.id, parsed.data.masterProviderId);
  if (!result.ok) return fail(result.message, result.status, result.code);

  return ok({ master: result.data });
}
