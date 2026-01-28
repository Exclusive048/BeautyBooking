import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { ensureStudioAccess } from "@/lib/studios/access";
import { prisma } from "@/lib/prisma";
import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";

const createSchema = z.object({
  phone: z.string().trim().min(6),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const p = params instanceof Promise ? await params : params;
  const accessError = await ensureStudioAccess(p.id, auth.user.id);
  if (accessError) return accessError;

  const provider = await prisma.provider.findUnique({
    where: { id: p.id },
    select: { id: true, type: true, ownerUserId: true },
  });
  if (!provider || provider.type !== ProviderType.STUDIO) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  if (provider.ownerUserId !== auth.user.id) {
    const studio = await prisma.studio.findUnique({
      where: { providerId: provider.id },
      select: { id: true },
    });
    if (!studio) {
      return fail("Forbidden", 403, "FORBIDDEN");
    }

    const adminMembership = await prisma.studioMembership.findFirst({
      where: {
        studioId: studio.id,
        userId: auth.user.id,
        status: MembershipStatus.ACTIVE,
        roles: { has: StudioRole.ADMIN },
      },
      select: { id: true },
    });

    if (!adminMembership) {
      return fail("Forbidden", 403, "FORBIDDEN");
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("Validation error", 400, "VALIDATION_ERROR");

  const studio = await prisma.studio.findUnique({
    where: { providerId: provider.id },
    select: { id: true },
  });
  if (!studio) {
    return fail("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const invite = await prisma.studioInvite.upsert({
    where: { studioId_phone: { studioId: studio.id, phone: parsed.data.phone } },
    update: { status: MembershipStatus.PENDING, invitedByUserId: auth.user.id },
    create: {
      studioId: studio.id,
      phone: parsed.data.phone,
      status: MembershipStatus.PENDING,
      invitedByUserId: auth.user.id,
    },
    select: { id: true, studioId: true, phone: true, status: true },
  });

  return ok({ invite }, { status: 201 });
}
